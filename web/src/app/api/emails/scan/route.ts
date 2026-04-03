import { NextRequest, NextResponse } from "next/server";
import { scanForInvoices } from "@/lib/gmail";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("gmail_refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { error: "Gmail not connected. Please connect Gmail first." },
      { status: 401 }
    );
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Gmail OAuth not configured on server" },
      { status: 503 }
    );
  }

  try {
    const emails = await scanForInvoices(refreshToken);

    // Return metadata only — never expose raw email content to the client
    const sanitized = emails.map((e) => ({
      messageId: e.messageId,
      from: e.from,
      subject: e.subject,
      date: e.date,
      vendor: e.vendor,
      amountCents: e.amountCents,
    }));

    return NextResponse.json({ emails: sanitized, count: sanitized.length });
  } catch (error) {
    console.error("Email scan error:", error);
    const message = error instanceof Error ? error.message : "Failed to scan emails";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
