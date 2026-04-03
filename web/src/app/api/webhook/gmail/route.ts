import { NextResponse } from "next/server";
import { google } from "googleapis";
import { simpleParser } from "mailparser";
import { generateInvoiceProof } from "@/lib/zkemail";
import { submitInvoiceOnChain } from "@/lib/contract";
import { extractVendorDomain, extractAmount } from "@/lib/gmail";
import { shortStringToFelt } from "@/lib/types";

/**
 * Gmail Pub/Sub Webhook
 *
 * Google Cloud Pub/Sub pushes a notification here when new emails arrive.
 * This endpoint:
 *   1. Decodes the Pub/Sub message to get the email address + historyId
 *   2. Fetches recent emails via Gmail API
 *   3. Detects invoice emails
 *   4. Generates ZK/DKIM proof
 *   5. Submits to on-chain invoice registry
 *
 * The on-chain policy engine handles auto-approve/pending from there.
 *
 * Setup:
 *   1. Create a GCP Pub/Sub topic
 *   2. Grant gmail-api-push@system.gserviceaccount.com publish access
 *   3. Create a push subscription pointing to this endpoint
 *   4. Call gmail.users.watch() with the topic name
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Pub/Sub sends: { message: { data: base64, messageId, publishTime }, subscription }
    const pubsubMessage = body.message;
    if (!pubsubMessage?.data) {
      return NextResponse.json({ error: "No message data" }, { status: 400 });
    }

    // Decode Pub/Sub message — contains { emailAddress, historyId }
    const decoded = JSON.parse(
      Buffer.from(pubsubMessage.data, "base64").toString("utf-8")
    );
    const { emailAddress, historyId } = decoded;

    if (!emailAddress) {
      return NextResponse.json({ error: "No email address" }, { status: 400 });
    }

    // Get stored refresh token for this email
    // For hackathon: use env var for the demo account
    const refreshToken = process.env.GMAIL_WEBHOOK_REFRESH_TOKEN;
    if (!refreshToken) {
      console.log("Webhook: no refresh token configured, skipping");
      return NextResponse.json({ skipped: true });
    }

    // Get the employee address for this email
    // For hackathon: use env var mapping
    const employeeAddress = process.env.WEBHOOK_EMPLOYEE_ADDRESS;
    if (!employeeAddress) {
      console.log("Webhook: no employee address configured, skipping");
      return NextResponse.json({ skipped: true });
    }

    // Fetch recent messages using history API
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    client.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: "v1", auth: client });

    // Get recent history changes
    const history = await gmail.users.history.list({
      userId: "me",
      startHistoryId: historyId,
      historyTypes: ["messageAdded"],
    });

    const newMessageIds: string[] = [];
    for (const record of history.data.history || []) {
      for (const added of record.messagesAdded || []) {
        if (added.message?.id) {
          newMessageIds.push(added.message.id);
        }
      }
    }

    if (newMessageIds.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    const processed: Array<{ messageId: string; invoiceId: number; txHash: string }> = [];

    for (const messageId of newMessageIds) {
      try {
        // Fetch full message
        const full = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "raw",
        });

        const raw = Buffer.from(full.data.raw!, "base64url").toString("utf-8");
        const parsed = await simpleParser(raw);

        const vendor = extractVendorDomain(parsed.from?.text || "");
        const textContent = parsed.text || "";
        const amountCents = extractAmount(textContent);

        // Skip non-invoice emails
        if (amountCents === 0) continue;

        // Generate proof
        const proof = await generateInvoiceProof(raw);

        // Submit on-chain — the contract handles dedup, policy, auto-approve
        const vendorFelt = shortStringToFelt(vendor.slice(0, 31));
        const { invoiceId, txHash } = await submitInvoiceOnChain({
          invoiceHash: proof.invoiceHash,
          employee: employeeAddress,
          vendor: vendorFelt,
          amountCents: proof.amountCents || amountCents,
          timestamp: proof.timestamp || Math.floor(Date.now() / 1000),
        });

        processed.push({ messageId, invoiceId, txHash });
        console.log(
          `Webhook: auto-submitted invoice #${invoiceId} for ${vendor} $${(amountCents / 100).toFixed(2)}`
        );
      } catch (err) {
        console.error(`Webhook: failed to process message ${messageId}:`, err);
      }
    }

    return NextResponse.json({ processed: processed.length, invoices: processed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook error";
    console.error("Webhook error:", message);
    // Always return 200 to Pub/Sub to avoid retry storms
    return NextResponse.json({ error: message }, { status: 200 });
  }
}
