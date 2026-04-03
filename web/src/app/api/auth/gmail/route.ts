import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gmail";

export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Gmail OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local" },
      { status: 503 }
    );
  }

  try {
    const authUrl = getAuthUrl();
    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error("Gmail auth URL error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate auth URL" },
      { status: 500 }
    );
  }
}

export async function POST() {
  // Support both GET and POST
  return GET();
}
