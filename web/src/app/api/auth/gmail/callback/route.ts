import { NextRequest, NextResponse } from "next/server";
import { getTokensFromCode } from "@/lib/gmail";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/dashboard?error=no_code", request.url)
    );
  }

  try {
    const { refreshToken } = await getTokensFromCode(code);

    const response = NextResponse.redirect(
      new URL("/employee?gmail=connected", request.url)
    );

    // Store refresh token in httpOnly cookie
    response.cookies.set("gmail_refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Gmail OAuth error:", error);
    return NextResponse.redirect(
      new URL("/employee?error=auth_failed", request.url)
    );
  }
}
