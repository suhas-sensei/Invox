import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { generateInvoiceProof } from "@/lib/zkemail";
import { submitInvoiceOnChain } from "@/lib/contract";
import { shortStringToFelt } from "@/lib/types";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("gmail_refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { error: "Gmail not connected" },
      { status: 401 }
    );
  }

  const { messageId, employeeAddress } = await request.json();

  if (!messageId || !employeeAddress) {
    return NextResponse.json(
      { error: "messageId and employeeAddress are required" },
      { status: 400 }
    );
  }

  try {
    // Fetch the raw email server-side
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const msg = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "raw",
    });

    const rawEmail = Buffer.from(msg.data.raw!, "base64url").toString("utf-8");

    // Generate ZK proof (or DKIM fallback)
    const proof = await generateInvoiceProof(rawEmail);

    if (!proof.verified) {
      return NextResponse.json(
        { error: "Email verification failed" },
        { status: 422 }
      );
    }

    // Truncate vendor to max 31 chars for felt252
    const vendorShort = proof.vendor.slice(0, 31);

    // Submit verified invoice on-chain
    const { invoiceId, txHash } = await submitInvoiceOnChain({
      invoiceHash: proof.invoiceHash,
      employee: employeeAddress,
      vendor: shortStringToFelt(vendorShort),
      amountCents: proof.amountCents,
      timestamp: proof.timestamp,
    });

    return NextResponse.json({
      invoiceId,
      txHash,
      invoiceHash: proof.invoiceHash,
      vendor: proof.vendor,
      amountCents: proof.amountCents,
      timestamp: proof.timestamp,
      proofVerified: proof.verified,
    });
  } catch (error) {
    console.error("Proof generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Proof generation failed",
      },
      { status: 500 }
    );
  }
}
