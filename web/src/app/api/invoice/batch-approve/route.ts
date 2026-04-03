import { NextResponse } from "next/server";
import { batchApproveOnChain } from "@/lib/contract";

export async function POST(req: Request) {
  try {
    const { invoiceIds } = await req.json();

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json({ error: "No invoice IDs provided" }, { status: 400 });
    }

    const txHash = await batchApproveOnChain(invoiceIds);
    return NextResponse.json({ success: true, txHash });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Batch approve failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
