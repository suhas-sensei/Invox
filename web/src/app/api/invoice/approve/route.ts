import { NextRequest, NextResponse } from "next/server";
import { approveInvoiceOnChain, markPaidOnChain, getInvoices, getPreferredToken, mintReceiptNFT } from "@/lib/contract";
import { payEmployee } from "@/lib/payments";
import { shortStringToFelt } from "@/lib/types";

export async function POST(request: NextRequest) {
  const { invoiceId, employeeAddress, amountCents, preferredToken, adminAddress } =
    await request.json();

  // On-chain access control is enforced by the contract itself

  if (!invoiceId && invoiceId !== 0) {
    return NextResponse.json(
      { error: "invoiceId is required" },
      { status: 400 }
    );
  }

  try {
    // Check current invoice status
    const invoices = await getInvoices();
    const invoice = invoices.find((i) => i.id === invoiceId);
    let approveTx = "";

    // Only approve if pending (skip if already auto-approved)
    if (invoice && invoice.status === "pending") {
      approveTx = await approveInvoiceOnChain(invoiceId);
    }

    // Get employee's preferred token from on-chain registry
    let tokenToUse = preferredToken;
    if (!tokenToUse && invoice?.employee) {
      try {
        const onChainToken = await getPreferredToken(invoice.employee);
        if (onChainToken && BigInt(onChainToken) !== 0n) {
          tokenToUse = onChainToken;
        }
      } catch { /* use default */ }
    }

    // Pay employee via MagicBlock Private Payments
    // Convert USD cents to lamports using live SOL price
    const amount = amountCents || invoice?.amountCents || 0;
    let solPrice = 130; // fallback
    try {
      const priceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        solPrice = priceData?.solana?.usd ?? 130;
      }
    } catch { /* use fallback */ }
    const usdAmount = amount / 100; // cents to dollars
    const solAmount = usdAmount / solPrice;
    const lamports = Math.round(solAmount * 1e9);

    const { txHash: paymentTx } = await payEmployee({
      employeeAddress: employeeAddress || invoice?.employee || "",
      amountLamports: lamports,
      tokenMint: tokenToUse,
    });

    // Mark paid on-chain
    await markPaidOnChain(invoiceId, paymentTx);

    // Mint receipt NFT to employee's wallet
    let nftTx = "";
    let nftTokenId = "";
    try {
      const emp = employeeAddress || invoice?.employee || "";
      const vendor = invoice?.vendor || "";
      const amount = amountCents || invoice?.amountCents || 0;
      const nft = await mintReceiptNFT({
        employee: emp,
        invoiceId,
        vendor: vendor.slice(0, 32),
        amountCents: amount,
        paymentTx,
        timestamp: Math.floor(Date.now() / 1000),
      });
      nftTx = nft.txHash;
      nftTokenId = nft.tokenId;
    } catch (nftErr) {
      console.error("NFT mint failed (non-blocking):", nftErr);
    }

    return NextResponse.json({
      success: true,
      approveTx,
      paymentTx,
      nftTx,
      nftTokenId,
    });
  } catch (error) {
    console.error("Approve/pay error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Approval/payment failed",
      },
      { status: 500 }
    );
  }
}
