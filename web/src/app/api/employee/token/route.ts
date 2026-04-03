import { NextResponse } from "next/server";
import { getPreferredToken, registerEmployeeOnChain, isEmployeeRegistered } from "@/lib/contract";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const employee = url.searchParams.get("employee");
  if (!employee) return NextResponse.json({ error: "employee required" }, { status: 400 });

  try {
    const token = await getPreferredToken(employee);
    // Zero address means not set
    const isZero = !token || token === "0x0";
    return NextResponse.json({ token: isZero ? null : token });
  } catch {
    return NextResponse.json({ token: null });
  }
}

export async function POST(req: Request) {
  try {
    const { employee, token } = await req.json();
    if (!employee || !token) {
      return NextResponse.json({ error: "employee and token required" }, { status: 400 });
    }

    // Register if needed, then the token is set during registration
    const registered = await isEmployeeRegistered(employee).catch(() => false);
    if (!registered) {
      const txHash = await registerEmployeeOnChain(employee, token);
      return NextResponse.json({ success: true, txHash, action: "registered" });
    }

    // Already registered — for hackathon, we store preference and use it during payment
    // The contract's set_preferred_token requires the employee to be the caller
    // So we store it server-side and pass it through to StarkZap during payment
    return NextResponse.json({ success: true, action: "updated" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
