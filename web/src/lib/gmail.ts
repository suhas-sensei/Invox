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
  // Specific vendor billing addresses
  "from:invoices@vercel.com",
  "from:billing@stripe.com subject:(receipt OR invoice)",
  "from:billing@notion.so subject:(receipt OR invoice)",
  "from:billing@figma.com subject:(receipt OR invoice)",
  "from:noreply@github.com subject:(receipt OR invoice)",
  "from:noreply@slack.com subject:(receipt OR invoice)",
  "from:noreply@email.amazonses.com subject:invoice",
  "from:billing@openai.com subject:(receipt OR invoice OR payment)",
  "from:billing@anthropic.com",
  "from:billing@cloudflare.com",
  "from:billing@digitalocean.com",
  "from:billing@linear.app",
  "from:billing@supabase.io OR from:billing@supabase.com",
  "from:billing@render.com",
  "from:billing@railway.app",
  "from:billing@fly.io",
  "from:billing@shopify.com",
  "from:billing@twilio.com",
  "from:billing@datadog.com",
  "from:billing@sentry.io",
  "from:billing@zoom.us",
  "from:billing@atlassian.com",
  "from:billing@mongodb.com",
  "from:billing@1password.com",
  "from:billing@dropbox.com",
  "from:noreply@canva.com subject:(receipt OR invoice)",
  "from:receipts@x.com subject:(receipt OR invoice)",
  // Catch-all: any email with invoice/receipt AND an attachment (real invoices)
  "subject:invoice has:attachment",
  "subject:receipt has:attachment",
  "subject:payment receipt",
];

export function extractVendorDomain(from: string): string {
  const match = from.match(/@([a-zA-Z0-9.-]+)/);
  if (!match) return "unknown";
  const domain = match[1].toLowerCase();
  const map: Record<string, string> = {
    amazonses: "aws.amazon.com",
    amazon: "aws.amazon.com",
    figma: "figma.com",
    stripe: "stripe.com",
    github: "github.com",
    notion: "notion.so",
    slack: "slack.com",
    vercel: "vercel.com",
    google: "google.com",
    cloudflare: "cloudflare.com",
    digitalocean: "digitalocean.com",
    linear: "linear.app",
    supabase: "supabase.com",
    netlify: "netlify.com",
    render: "render.com",
    railway: "railway.app",
    fly: "fly.io",
    heroku: "heroku.com",
    openai: "openai.com",
    anthropic: "anthropic.com",
    mongodb: "mongodb.com",
    atlassian: "atlassian.com",
    zoom: "zoom.us",
    "1password": "1password.com",
    dropbox: "dropbox.com",
    canva: "canva.com",
    shopify: "shopify.com",
    twilio: "twilio.com",
    sendgrid: "sendgrid.com",
    datadog: "datadog.com",
    sentry: "sentry.io",
    x: "x.com",
  };
  for (const [key, value] of Object.entries(map)) {
    if (domain.includes(key)) return value;
  }
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
        maxResults: 10,
      });

      console.log(`[SCAN] query="${query}" found ${list.data.messages?.length ?? 0} messages`);

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
          // Try plain text first, fall back to stripped HTML
          const textContent = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ") : "");
          const amountCents = extractAmount(textContent) || extractAmount(parsed.subject || "");

          console.log(`[SCAN] email: vendor=${vendor} amount=${amountCents} subject="${parsed.subject?.slice(0, 60)}"`);
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
