import { NextResponse } from "next/server";
import { getPolicy, setAutoApproveThreshold, setMonthlyCap } from "@/lib/contract";

export async function GET() {
  try {
    const policy = await getPolicy();
    return NextResponse.json(policy);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get policy";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { threshold, monthlyCap } = await req.json();

    if (typeof threshold === "number") {
      await setAutoApproveThreshold(threshold);
    }
    if (typeof monthlyCap === "number") {
      await setMonthlyCap(monthlyCap);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update policy";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
