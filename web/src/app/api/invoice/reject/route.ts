import { NextResponse } from "next/server";
import { rejectInvoiceOnChain } from "@/lib/contract";

export async function POST(req: Request) {
  try {
    const { invoiceId } = await req.json();

    if (typeof invoiceId !== "number") {
      return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
    }

    const txHash = await rejectInvoiceOnChain(invoiceId);
    return NextResponse.json({ success: true, txHash });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Reject failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
