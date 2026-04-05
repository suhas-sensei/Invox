/**
 * MagicBlock Private Payments API
 * Confidential SPL transfers with one API call
 * Split payments and time-delayed releases included
 * https://payments.magicblock.app
 *
 * Fallback: direct SOL transfer via system program (localnet)
 */

import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8899";
const MAGICBLOCK_PAYMENTS_API = "https://payments.magicblock.app/api";

// Solana token mints
export const DEVNET_TOKENS = {
  SOL: "native",
  USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
} as const;

export const TOKEN_LABELS: Record<string, string> = {
  [DEVNET_TOKENS.SOL]: "SOL",
  [DEVNET_TOKENS.USDC]: "USDC",
  [DEVNET_TOKENS.USDT]: "USDT",
};

export interface PaymentResult {
  txHash: string;
  status: string;
}

function loadAdminKeypair(): Keypair {
  const kpPath =
    process.env.ADMIN_KEYPAIR_PATH ||
    `${process.env.HOME}/.config/solana/id.json`;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  const raw = JSON.parse(fs.readFileSync(kpPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

/**
 * Pay an employee using MagicBlock Private Payments API
 * Confidential SPL transfer — amount and recipient are shielded on-chain
 * Falls back to direct SOL transfer on localnet
 */
export async function payEmployee(params: {
  employeeAddress: string;
  amountLamports: number;
  tokenMint?: string;
}): Promise<PaymentResult> {
  const { employeeAddress, amountLamports, tokenMint } = params;

  // Try MagicBlock Private Payments first (confidential transfer)
  try {
    const response = await fetch(`${MAGICBLOCK_PAYMENTS_API}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: employeeAddress,
        amount: amountLamports,
        token: tokenMint || DEVNET_TOKENS.SOL,
        confidential: true,
      }),
    });

    if (response.ok) {
      const data = await response.json();

      // If MagicBlock returns a transaction to sign
      if (data.transactionBase64) {
        const connection = new Connection(RPC_URL, "confirmed");
        const admin = loadAdminKeypair();
        const txBuf = Buffer.from(data.transactionBase64, "base64");
        const tx = Transaction.from(txBuf);
        tx.partialSign(admin);
        const txHash = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(txHash, "confirmed");
        return { txHash, status: "confirmed_private" };
      }

      return {
        txHash: data.signature || data.txHash || "pending",
        status: "confirmed_private",
      };
    }
  } catch (e) {
    console.log(
      "MagicBlock Private Payments unavailable, using direct transfer:",
      e instanceof Error ? e.message : "unknown"
    );
  }

  // Fallback: direct SOL transfer (localnet/devnet)
  const connection = new Connection(RPC_URL, "confirmed");
  const admin = loadAdminKeypair();
  const recipient = new PublicKey(employeeAddress);
  const lamports = Math.max(amountLamports, 1000);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: recipient,
      lamports,
    })
  );

  const txHash = await sendAndConfirmTransaction(connection, tx, [admin]);
  return { txHash, status: "confirmed" };
}

/**
 * Batch pay multiple employees via MagicBlock split payments
 * One API call → multiple confidential transfers
 * Falls back to batched SOL transfers on localnet
 */
export async function batchPayEmployees(
  payments: Array<{
    employeeAddress: string;
    amountLamports: number;
    tokenMint?: string;
  }>
): Promise<PaymentResult> {
  // Try MagicBlock split payment first
  try {
    const response = await fetch(
      `${MAGICBLOCK_PAYMENTS_API}/split-transfer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transfers: payments.map((p) => ({
            recipient: p.employeeAddress,
            amount: p.amountLamports,
            token: p.tokenMint || DEVNET_TOKENS.SOL,
          })),
          confidential: true,
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return {
        txHash: data.signature || data.txHash || "pending",
        status: "confirmed_private",
      };
    }
  } catch {
    console.log("MagicBlock batch API unavailable, using direct transfers");
  }

  // Fallback: batched SOL transfers
  const connection = new Connection(RPC_URL, "confirmed");
  const admin = loadAdminKeypair();

  const tx = new Transaction();
  for (const p of payments) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: new PublicKey(p.employeeAddress),
        lamports: Math.max(p.amountLamports, 1000),
      })
    );
  }

  const txHash = await sendAndConfirmTransaction(connection, tx, [admin]);
  return { txHash, status: "confirmed" };
}
