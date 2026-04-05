import { Connection, PublicKey, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { createHash } from "crypto";
import type { Invoice } from "./types";
import { parseStatus } from "./types";

// IDLs (imported as JSON)
import invoiceRegistryIdl from "./idl/invoice_registry.json";
import employeeRegistryIdl from "./idl/employee_registry.json";
import reimbursementNftIdl from "./idl/reimbursement_nft.json";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8899";

const INVOICE_REGISTRY_ID = new PublicKey(
  process.env.INVOICE_REGISTRY_PROGRAM_ID || "9Zwa4Gps5uKjxEfUefLCa9ohf4aFzNgQuxRtA1fwvcLo"
);
const EMPLOYEE_REGISTRY_ID = new PublicKey(
  process.env.EMPLOYEE_REGISTRY_PROGRAM_ID || "FJoYF2xDCeCkaFxEL7gXuavy6cWJ3mbtzwsock1h73bo"
);
const REIMBURSEMENT_NFT_ID = new PublicKey(
  process.env.REIMBURSEMENT_NFT_PROGRAM_ID || "BN6ry1pAjXhibJNS4h8Fseqi8KTge6dmkxTAnnoc71Ng"
);

// ── Connection + Admin Wallet ───────────────────────────────────────

function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

let _adminKeypair: Keypair | null = null;

function loadAdminKeypair(): Keypair {
  if (_adminKeypair) return _adminKeypair;
  // Load keypair from env var (base64 JSON array) or file path
  const kpJson = process.env.ADMIN_KEYPAIR_JSON;
  if (kpJson) {
    _adminKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(kpJson)));
    return _adminKeypair;
  }
  // Fallback: read from file using dynamic require to avoid Turbopack tracing
  const kpPath = process.env.ADMIN_KEYPAIR_PATH || `${process.env.HOME}/.config/solana/id.json`;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  const raw = JSON.parse(fs.readFileSync(kpPath, "utf-8"));
  _adminKeypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  return _adminKeypair;
}

// Minimal wallet adapter for server-side AnchorProvider
function makeWallet(keypair: Keypair) {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction>(tx: T): Promise<T> => {
      tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => {
      txs.forEach((tx) => tx.partialSign(keypair));
      return txs;
    },
  };
}

function getProvider(): AnchorProvider {
  const connection = getConnection();
  const admin = loadAdminKeypair();
  const wallet = makeWallet(admin);
  return new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
}

function getInvoiceProgram() {
  const provider = getProvider();
  return new Program(invoiceRegistryIdl as Idl, provider);
}

function getEmployeeProgram() {
  const provider = getProvider();
  return new Program(employeeRegistryIdl as Idl, provider);
}

function getNftProgram() {
  const provider = getProvider();
  return new Program(reimbursementNftIdl as Idl, provider);
}

// ── PDA helpers ─────────────────────────────────────────────────────

function getStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("state")], INVOICE_REGISTRY_ID);
}

function getInvoicePDA(invoiceId: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(invoiceId));
  return PublicKey.findProgramAddressSync([Buffer.from("invoice"), buf], INVOICE_REGISTRY_ID);
}

function getEmployeePDA(employee: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("employee"), employee.toBuffer()], EMPLOYEE_REGISTRY_ID);
}

function getNftStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("nft-state")], REIMBURSEMENT_NFT_ID);
}

function getReceiptPDA(tokenId: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(tokenId));
  return PublicKey.findProgramAddressSync([Buffer.from("receipt"), buf], REIMBURSEMENT_NFT_ID);
}

function getDedupPDA(invoiceHash: number[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dedup"), Buffer.from(invoiceHash)],
    INVOICE_REGISTRY_ID
  );
}

function getMonthlySpendPDA(employee: PublicKey, timestamp: number): [PublicKey, number] {
  const month = Math.floor(timestamp / 2592000);
  const monthBuf = Buffer.alloc(2);
  monthBuf.writeUInt16LE(month);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("monthly"), employee.toBuffer(), monthBuf],
    INVOICE_REGISTRY_ID
  );
}

// ── Read Operations ─────────────────────────────────────────────────

export async function getInvoices(): Promise<Invoice[]> {
  const program = getInvoiceProgram();
  const [statePda] = getStatePDA();

  try {
    const state = await (program.account as any).registryState.fetch(statePda);
    const count = state.invoiceCount.toNumber();
    if (count === 0) return [];

    const invoices: Invoice[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const [invoicePda] = getInvoicePDA(i);
        const inv = await (program.account as any).invoice.fetch(invoicePda);
        invoices.push({
          id: inv.id.toNumber(),
          invoiceHash: Buffer.from(inv.invoiceHash).toString("hex"),
          employee: inv.employee.toString(),
          vendor: inv.vendor,
          amountCents: inv.amountCents.toNumber(),
          timestamp: inv.timestamp.toNumber(),
          status: parseStatus(inv.status),
          proofVerified: inv.proofVerified,
          paymentTx: inv.paymentTx || "",
        });
      } catch {
        // Skip missing/closed accounts
      }
    }
    return invoices;
  } catch (e) {
    console.error("getInvoices error:", e);
    return [];
  }
}

export async function getEmployeeInvoices(employee: string): Promise<Invoice[]> {
  const all = await getInvoices();
  return all.filter((inv) => inv.employee === employee);
}

export async function getPolicy(): Promise<{ threshold: number; monthlyCap: number }> {
  const program = getInvoiceProgram();
  const [statePda] = getStatePDA();

  try {
    const state = await (program.account as any).registryState.fetch(statePda);
    return {
      threshold: state.autoApproveThreshold.toNumber(),
      monthlyCap: state.monthlyCap.toNumber(),
    };
  } catch {
    return { threshold: 5000, monthlyCap: 100000 };
  }
}

export async function getPreferredToken(employee: string): Promise<string | null> {
  const program = getEmployeeProgram();
  const employeePk = new PublicKey(employee);
  const [recordPda] = getEmployeePDA(employeePk);

  try {
    const record = await (program.account as any).employeeRecord.fetch(recordPda);
    return record.preferredToken.toString();
  } catch {
    return null;
  }
}

export async function isEmployeeRegistered(employee: string): Promise<boolean> {
  const program = getEmployeeProgram();
  const employeePk = new PublicKey(employee);
  const [recordPda] = getEmployeePDA(employeePk);

  try {
    const record = await (program.account as any).employeeRecord.fetch(recordPda);
    return record.registered === true;
  } catch {
    return false;
  }
}

// ── Write Operations ────────────────────────────────────────────────

export async function submitInvoiceOnChain(params: {
  invoiceHash: string;
  employee: string;
  vendor: string;
  amountCents: number;
  timestamp: number;
}): Promise<{ invoiceId: number; txHash: string }> {
  const program = getInvoiceProgram();
  const admin = loadAdminKeypair();
  const [statePda] = getStatePDA();

  // Get current invoice count to derive the invoice PDA
  const state = await (program.account as any).registryState.fetch(statePda);
  const invoiceId = state.invoiceCount.toNumber();
  const [invoicePda] = getInvoicePDA(invoiceId);

  const employeePk = new PublicKey(params.employee);
  const timestamp = params.timestamp || Math.floor(Date.now() / 1000);

  // DKIM domain hash (32 zero bytes for local/fallback)
  const dkimDomainHash = Array.from(Buffer.alloc(32, 0));

  // Compute invoice hash exactly as the on-chain program does:
  // SHA256(vendor_bytes + amount_cents_le_u64 + timestamp_le_i64 + dkim_domain_hash)
  const hashData = Buffer.concat([
    Buffer.from(params.vendor),
    (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(params.amountCents)); return b; })(),
    (() => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(timestamp)); return b; })(),
    Buffer.from(dkimDomainHash),
  ]);
  const invoiceHash = Array.from(createHash("sha256").update(hashData).digest());

  const [dedupPda] = getDedupPDA(invoiceHash);
  const [monthlySpendPda] = getMonthlySpendPDA(employeePk, timestamp);

  const txHash = await program.methods
    .submitInvoice(
      invoiceHash,
      params.vendor,
      new BN(params.amountCents),
      new BN(timestamp),
      dkimDomainHash
    )
    .accounts({
      state: statePda,
      invoice: invoicePda,
      dedup: dedupPda,
      monthlySpend: monthlySpendPda,
      employee: employeePk,
      payer: admin.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { invoiceId, txHash };
}

export async function approveInvoiceOnChain(invoiceId: number): Promise<string> {
  const program = getInvoiceProgram();
  const admin = loadAdminKeypair();
  const [statePda] = getStatePDA();
  const [invoicePda] = getInvoicePDA(invoiceId);

  return program.methods
    .approveInvoice()
    .accounts({
      state: statePda,
      invoice: invoicePda,
      admin: admin.publicKey,
    })
    .rpc();
}

export async function batchApproveOnChain(invoiceIds: number[]): Promise<string> {
  let lastTx = "";
  for (const id of invoiceIds) {
    lastTx = await approveInvoiceOnChain(id);
  }
  return lastTx;
}

export async function rejectInvoiceOnChain(invoiceId: number): Promise<string> {
  const program = getInvoiceProgram();
  const admin = loadAdminKeypair();
  const [statePda] = getStatePDA();
  const [invoicePda] = getInvoicePDA(invoiceId);

  return program.methods
    .rejectInvoice()
    .accounts({
      state: statePda,
      invoice: invoicePda,
      admin: admin.publicKey,
    })
    .rpc();
}

export async function markPaidOnChain(invoiceId: number, paymentTx: string): Promise<string> {
  const program = getInvoiceProgram();
  const admin = loadAdminKeypair();
  const [statePda] = getStatePDA();
  const [invoicePda] = getInvoicePDA(invoiceId);

  return program.methods
    .markPaid(paymentTx)
    .accounts({
      state: statePda,
      invoice: invoicePda,
      authority: admin.publicKey,
    })
    .rpc();
}

export async function setAutoApproveThreshold(amountCents: number): Promise<string> {
  const program = getInvoiceProgram();
  const admin = loadAdminKeypair();
  const [statePda] = getStatePDA();

  return program.methods
    .setAutoApproveThreshold(new BN(amountCents))
    .accounts({
      state: statePda,
      admin: admin.publicKey,
    })
    .rpc();
}

export async function setMonthlyCap(amountCents: number): Promise<string> {
  const program = getInvoiceProgram();
  const admin = loadAdminKeypair();
  const [statePda] = getStatePDA();

  return program.methods
    .setMonthlyCap(new BN(amountCents))
    .accounts({
      state: statePda,
      admin: admin.publicKey,
    })
    .rpc();
}

export async function registerEmployeeOnChain(employee: string, preferredToken: string): Promise<string> {
  const program = getEmployeeProgram();
  const admin = loadAdminKeypair();
  const employeePk = new PublicKey(employee);
  const [recordPda] = getEmployeePDA(employeePk);
  const tokenPk = new PublicKey(preferredToken);

  return program.methods
    .registerEmployee(tokenPk)
    .accounts({
      employeeRecord: recordPda,
      employee: employeePk,
      payer: admin.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function setPreferredTokenOnChain(employee: string, token: string): Promise<string> {
  // This requires the employee to be the signer — can't do server-side with admin key
  // For local testing, we skip this
  return "skip-server-side";
}

export async function mintReceiptNFT(params: {
  employee: string;
  invoiceId: number;
  vendor: string;
  amountCents: number;
  paymentTx: string;
  timestamp: number;
}): Promise<{ txHash: string; tokenId: string }> {
  const program = getNftProgram();
  const admin = loadAdminKeypair();
  const [nftStatePda] = getNftStatePDA();

  // Get current total supply for the receipt PDA
  const nftState = await (program.account as any).nftState.fetch(nftStatePda);
  const tokenId = nftState.totalSupply.toNumber();
  const [receiptPda] = getReceiptPDA(tokenId);

  const employeePk = new PublicKey(params.employee);

  const txHash = await program.methods
    .mintReceipt(
      new BN(params.invoiceId),
      params.vendor,
      new BN(params.amountCents),
      params.paymentTx,
      new BN(params.timestamp)
    )
    .accounts({
      state: nftStatePda,
      receipt: receiptPda,
      employee: employeePk,
      payer: admin.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { txHash, tokenId: tokenId.toString() };
}

export async function getEmployeeReceipts(employee: string): Promise<Array<{
  tokenId: number;
  invoiceId: number;
  vendor: string;
  amountCents: number;
  paymentTx: string;
  timestamp: number;
}>> {
  const program = getNftProgram();
  const [nftStatePda] = getNftStatePDA();
  const employeePk = new PublicKey(employee);

  try {
    const nftState = await (program.account as any).nftState.fetch(nftStatePda);
    const totalSupply = nftState.totalSupply.toNumber();

    const receipts: Array<{
      tokenId: number;
      invoiceId: number;
      vendor: string;
      amountCents: number;
      paymentTx: string;
      timestamp: number;
    }> = [];

    for (let i = 0; i < totalSupply; i++) {
      try {
        const [receiptPda] = getReceiptPDA(i);
        const receipt = await (program.account as any).receipt.fetch(receiptPda);
        if (receipt.employee.toString() === employeePk.toString()) {
          receipts.push({
            tokenId: receipt.tokenId.toNumber(),
            invoiceId: receipt.invoiceId.toNumber(),
            vendor: receipt.vendor,
            amountCents: receipt.amountCents.toNumber(),
            paymentTx: receipt.paymentTx,
            timestamp: receipt.timestamp.toNumber(),
          });
        }
      } catch {
        // Skip
      }
    }
    return receipts;
  } catch {
    return [];
  }
}

export async function getTreasuryBalance(token: string): Promise<bigint> {
  const connection = getConnection();
  try {
    const tokenPk = new PublicKey(token);
    const info = await connection.getAccountInfo(tokenPk);
    return BigInt(info?.lamports || 0);
  } catch {
    return 0n;
  }
}

export async function getTotalDisbursed(): Promise<bigint> {
  return 0n;
}
