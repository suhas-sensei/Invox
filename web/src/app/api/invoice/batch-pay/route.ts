import { NextResponse } from "next/server";
import { getInvoices, markPaidOnChain } from "@/lib/contract";
import { payEmployee } from "@/lib/payments";

export async function POST(req: Request) {
  try {
    const { invoiceIds } = await req.json();

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json({ error: "No invoice IDs provided" }, { status: 400 });
    }

    const allInvoices = await getInvoices();
    const toPay = allInvoices.filter(
      (inv) =>
        invoiceIds.includes(inv.id) &&
        (inv.status === "approved" || inv.status === "auto_approved")
    );

    const results: Array<{ invoiceId: number; txHash: string }> = [];

    for (const inv of toPay) {
      // Pay via MagicBlock Private Payments
      const { txHash } = await payEmployee({
        employeeAddress: inv.employee,
        amountLamports: inv.amountCents * 10000, // cents to lamports approximation
      });

      // Mark paid on-chain
      await markPaidOnChain(inv.id, txHash);
      results.push({ invoiceId: inv.id, txHash });
    }

    return NextResponse.json({ success: true, paid: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Batch pay failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
