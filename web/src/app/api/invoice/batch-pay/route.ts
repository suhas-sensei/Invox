import { NextResponse } from "next/server";
import { getInvoices, markPaidOnChain, mintReceiptNFT } from "@/lib/contract";
import { payEmployee } from "@/lib/payments";
import {
  createEphemeralSession,
  executeInEphemeral,
  commitAndSettle,
  isEphemeralAvailable,
} from "@/lib/ephemeral";
import { PublicKey, Keypair } from "@solana/web3.js";

function loadAdminKeypair(): Keypair {
  const kpPath =
    process.env.ADMIN_KEYPAIR_PATH ||
    `${process.env.HOME}/.config/solana/id.json`;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  const raw = JSON.parse(fs.readFileSync(kpPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export async function POST(req: Request) {
  try {
    const { invoiceIds } = await req.json();

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json(
        { error: "No invoice IDs provided" },
        { status: 400 }
      );
    }

    const allInvoices = await getInvoices();
    const toPay = allInvoices.filter(
      (inv) =>
        invoiceIds.includes(inv.id) &&
        (inv.status === "approved" || inv.status === "auto_approved")
    );

    if (toPay.length === 0) {
      return NextResponse.json(
        { error: "No payable invoices found" },
        { status: 400 }
      );
    }

    const results: Array<{
      invoiceId: number;
      paymentTx: string;
      nftTokenId: string;
      ephemeral: boolean;
    }> = [];

    // Get SOL price for USD → lamports conversion
    let solPrice = 130;
    try {
      const priceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        solPrice = priceData?.solana?.usd ?? 130;
      }
    } catch { /* use fallback */ }
    const centsToLamports = (cents: number) => Math.round((cents / 100 / solPrice) * 1e9);

    // Try Ephemeral Rollup for batch processing
    const useER = await isEphemeralAvailable();

    if (useER && toPay.length > 1) {
      // Ephemeral Rollup path — batch all operations in one ER session
      console.log(
        `[BATCH] Using MagicBlock Ephemeral Rollup for ${toPay.length} invoices`
      );
      const admin = loadAdminKeypair();

      // Collect all invoice PDAs that need to be modified
      const INVOICE_REGISTRY_ID = new PublicKey(
        process.env.INVOICE_REGISTRY_PROGRAM_ID ||
          "51fkQxX7Sce6L3M9vbrHoDppo7oLjLES63Yq5C7Z6qx2"
      );
      const accountsToDelegate = toPay.map((inv) => {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(BigInt(inv.id));
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from("invoice"), buf],
          INVOICE_REGISTRY_ID
        );
        return pda;
      });

      const session = await createEphemeralSession(
        accountsToDelegate,
        admin
      );

      // Execute all pay + mark_paid + mint_nft in the ER
      await executeInEphemeral(
        session,
        toPay.map((inv) => async () => {
          // Pay via MagicBlock Private Payments
          const { txHash: paymentTx } = await payEmployee({
            employeeAddress: inv.employee,
            amountLamports: centsToLamports(inv.amountCents),
          });

          // Mark paid on-chain
          await markPaidOnChain(inv.id, paymentTx);

          // Mint receipt NFT
          let nftTokenId = "";
          try {
            const nft = await mintReceiptNFT({
              employee: inv.employee,
              invoiceId: inv.id,
              vendor: inv.vendor.slice(0, 32),
              amountCents: inv.amountCents,
              paymentTx,
              timestamp: Math.floor(Date.now() / 1000),
            });
            nftTokenId = nft.tokenId;
          } catch (e) {
            console.error(`[BATCH] NFT mint failed for #${inv.id}:`, e);
          }

          results.push({
            invoiceId: inv.id,
            paymentTx,
            nftTokenId,
            ephemeral: true,
          });
        })
      );

      // Settle back to L1
      await commitAndSettle(session, admin);
    } else {
      // Standard path — process sequentially on L1
      console.log(
        `[BATCH] Processing ${toPay.length} invoices on base layer`
      );
      for (const inv of toPay) {
        const { txHash: paymentTx } = await payEmployee({
          employeeAddress: inv.employee,
          amountLamports: centsToLamports(inv.amountCents),
        });

        await markPaidOnChain(inv.id, paymentTx);

        let nftTokenId = "";
        try {
          const nft = await mintReceiptNFT({
            employee: inv.employee,
            invoiceId: inv.id,
            vendor: inv.vendor.slice(0, 32),
            amountCents: inv.amountCents,
            paymentTx,
            timestamp: Math.floor(Date.now() / 1000),
          });
          nftTokenId = nft.tokenId;
        } catch (e) {
          console.error(`[BATCH] NFT mint failed for #${inv.id}:`, e);
        }

        results.push({
          invoiceId: inv.id,
          paymentTx,
          nftTokenId,
          ephemeral: false,
        });
      }
    }

    return NextResponse.json({
      success: true,
      paid: results,
      ephemeralRollup: useER && toPay.length > 1,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Batch pay failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
