import { google } from "googleapis";
import { simpleParser } from "mailparser";
import type { RawEmailData } from "./types";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
}

export async function getTokensFromCode(
  code: string
): Promise<{ refreshToken: string; accessToken: string }> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return {
    refreshToken: tokens.refresh_token || "",
    accessToken: tokens.access_token || "",
  };
}

const VENDOR_QUERIES = [
  "from:noreply@email.amazonses.com subject:invoice",
  "from:billing@figma.com subject:receipt",
  "from:billing@stripe.com subject:receipt",
  "from:noreply@github.com subject:receipt",
  "from:billing@notion.so subject:invoice",
  "from:noreply@slack.com subject:invoice",
  "from:invoices@vercel.com",
  "subject:invoice has:attachment",
  "subject:receipt has:attachment",
];

export function extractVendorDomain(from: string): string {
  const match = from.match(/@([a-zA-Z0-9.-]+)/);
  if (!match) return "unknown";
  const domain = match[1].toLowerCase();
  // Normalize known vendor domains
  if (domain.includes("amazonses") || domain.includes("amazon"))
    return "aws.amazon.com";
  if (domain.includes("figma")) return "figma.com";
  if (domain.includes("stripe")) return "stripe.com";
  if (domain.includes("github")) return "github.com";
  if (domain.includes("notion")) return "notion.so";
  if (domain.includes("slack")) return "slack.com";
  if (domain.includes("vercel")) return "vercel.com";
  return domain;
}

export function extractAmount(text: string): number {
  // Match patterns like $49.99, USD 49.99, 49.99 USD
  const patterns = [
    /\$\s?([\d,]+\.?\d{0,2})/,
    /USD\s?([\d,]+\.?\d{0,2})/i,
    /([\d,]+\.?\d{0,2})\s?USD/i,
    /Total[:\s]+\$?([\d,]+\.?\d{0,2})/i,
    /Amount[:\s]+\$?([\d,]+\.?\d{0,2})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (amount > 0 && amount < 100000) {
        return Math.round(amount * 100);
      }
    }
  }
  return 0;
}

export async function scanForInvoices(
  refreshToken: string
): Promise<RawEmailData[]> {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: client });

  const results: RawEmailData[] = [];
  const seenIds = new Set<string>();

  for (const query of VENDOR_QUERIES) {
    try {
      const list = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 5,
      });

      for (const msg of list.data.messages || []) {
        if (!msg.id || seenIds.has(msg.id)) continue;
        seenIds.add(msg.id);

        try {
          const full = await gmail.users.messages.get({
            userId: "me",
            id: msg.id,
            format: "raw",
          });

          const raw = Buffer.from(full.data.raw!, "base64url").toString(
            "utf-8"
          );
          const parsed = await simpleParser(raw);

          const vendor = extractVendorDomain(parsed.from?.text || "");
          const textContent = parsed.text || "";
          const amountCents = extractAmount(textContent);

          if (amountCents > 0) {
            results.push({
              messageId: msg.id,
              from: parsed.from?.text || "",
              subject: parsed.subject || "",
              date: parsed.date?.toISOString() || new Date().toISOString(),
              rawContent: raw,
              vendor,
              amountCents,
            });
          }
        } catch {
          // Skip individual email errors
        }
      }
    } catch {
      // Skip query errors (e.g., rate limits)
    }
  }

  return results;
}
