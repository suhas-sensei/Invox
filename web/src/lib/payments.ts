/**
 * MagicBlock Private Payments API + Jupiter Auto-Swap
 *
 * Flow:
 * 1. Employee selects preferred token (SOL/USDC/USDT)
 * 2. Jupiter swaps admin's SOL → employee's preferred token
 * 3. MagicBlock Private Payments transfers confidentially
 * 4. Fallback: direct SOL transfer on localnet
 *
 * https://payments.magicblock.app
 * https://station.jup.ag/docs/apis/swap-api
 */

import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8899";
const MAGICBLOCK_PAYMENTS_API = "https://payments.magicblock.app/api";
const JUPITER_API = "https://quote-api.jup.ag/v6";

// Well-known Solana token mints
export const DEVNET_TOKENS = {
  SOL: "native",
  USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
} as const;

// Native SOL mint address (for Jupiter)
const SOL_MINT = "So11111111111111111111111111111111111111112";

export const TOKEN_LABELS: Record<string, string> = {
  [DEVNET_TOKENS.SOL]: "SOL",
  [DEVNET_TOKENS.USDC]: "USDC",
  [DEVNET_TOKENS.USDT]: "USDT",
};

export interface PaymentResult {
  txHash: string;
  status: string;
  swapTx?: string;
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

// ── Jupiter Auto-Swap ───────────────────────────────────────────────

/**
 * Get a Jupiter swap quote: SOL → target token
 */
async function getJupiterQuote(
  outputMint: string,
  amountLamports: number
): Promise<any> {
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint,
    amount: String(amountLamports),
    slippageBps: "100", // 1% slippage
  });

  const res = await fetch(`${JUPITER_API}/quote?${params}`);
  if (!res.ok) throw new Error(`Jupiter quote failed: ${res.status}`);
  return res.json();
}

/**
 * Build a Jupiter swap transaction from a quote
 */
async function getJupiterSwapTx(
  quote: any,
  userPublicKey: string
): Promise<string> {
  const res = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap failed: ${res.status}`);
  const data = await res.json();
  return data.swapTransaction;
}

/**
 * Execute a Jupiter swap: convert admin's SOL to target token
 * Returns the swap tx hash
 */
async function executeJupiterSwap(
  connection: Connection,
  admin: Keypair,
  outputMint: string,
  amountLamports: number
): Promise<string> {
  console.log(
    `[SWAP] Jupiter: ${amountLamports} lamports SOL → ${outputMint.slice(0, 8)}...`
  );

  const quote = await getJupiterQuote(outputMint, amountLamports);
  const swapTxBase64 = await getJupiterSwapTx(
    quote,
    admin.publicKey.toBase58()
  );

  // Deserialize and sign the versioned transaction
  const txBuf = Buffer.from(swapTxBase64, "base64");
  const versionedTx = VersionedTransaction.deserialize(txBuf);
  versionedTx.sign([admin]);

  const txHash = await connection.sendRawTransaction(versionedTx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(txHash, "confirmed");

  console.log(`[SWAP] Jupiter swap confirmed: ${txHash}`);
  return txHash;
}

// ── Payment ─────────────────────────────────────────────────────────

/**
 * Pay an employee:
 * 1. If employee wants non-SOL token → Jupiter swap SOL → token
 * 2. MagicBlock Private Payments for confidential transfer
 * 3. Fallback: direct SOL transfer on localnet
 */
export async function payEmployee(params: {
  employeeAddress: string;
  amountLamports: number;
  tokenMint?: string;
}): Promise<PaymentResult> {
  const { employeeAddress, amountLamports, tokenMint } = params;
  const connection = new Connection(RPC_URL, "confirmed");
  const admin = loadAdminKeypair();
  let swapTx: string | undefined;

  // Step 1: Auto-swap if employee wants non-SOL token
  const wantsSwap = tokenMint && tokenMint !== DEVNET_TOKENS.SOL && tokenMint !== "native";
  if (wantsSwap) {
    try {
      swapTx = await executeJupiterSwap(
        connection,
        admin,
        tokenMint,
        amountLamports
      );
    } catch (e) {
      console.log(
        "[SWAP] Jupiter swap unavailable (devnet), paying in SOL:",
        e instanceof Error ? e.message : "unknown"
      );
      // Continue with SOL payment if swap fails
    }
  }

  // Step 2: Try MagicBlock Private Payments (confidential transfer)
  try {
    const response = await fetch(`${MAGICBLOCK_PAYMENTS_API}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: employeeAddress,
        amount: amountLamports,
        token: swapTx ? tokenMint : DEVNET_TOKENS.SOL,
        confidential: true,
      }),
    });

    if (response.ok) {
      const data = await response.json();

      if (data.transactionBase64) {
        const txBuf = Buffer.from(data.transactionBase64, "base64");
        const tx = Transaction.from(txBuf);
        tx.partialSign(admin);
        const txHash = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(txHash, "confirmed");
        return { txHash, status: "confirmed_private", swapTx };
      }

      return {
        txHash: data.signature || data.txHash || "pending",
        status: "confirmed_private",
        swapTx,
      };
    }
  } catch (e) {
    console.log(
      "MagicBlock Private Payments unavailable, using direct transfer:",
      e instanceof Error ? e.message : "unknown"
    );
  }

  // Step 3: Fallback — direct SOL transfer
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
  return { txHash, status: "confirmed", swapTx };
}

/**
 * Batch pay multiple employees via MagicBlock split payments
 */
export async function batchPayEmployees(
  payments: Array<{
    employeeAddress: string;
    amountLamports: number;
    tokenMint?: string;
  }>
): Promise<PaymentResult> {
  // Try MagicBlock split payment
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
