import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import type { Invoice } from "./types";
import { parseStatus, feltToShortString } from "./types";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

// Program ID — replace after deployment
const PROGRAM_ID = new PublicKey("HzTbJF5WV2nVPUqnZ5aVRj5akdFw7MWbUFEaFRp8mp5c");

function getStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("state")], PROGRAM_ID);
}

function getInvoicePDA(invoiceId: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(invoiceId));
  return PublicKey.findProgramAddressSync([Buffer.from("invoice"), buf], PROGRAM_ID);
}

function getEmployeePDA(employee: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("employee"), employee.toBuffer()], PROGRAM_ID);
}

function getReceiptPDA(receiptId: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(receiptId));
  return PublicKey.findProgramAddressSync([Buffer.from("receipt"), buf], PROGRAM_ID);
}

// ── Read Operations ─────────────────────────────────────────────────

export async function getInvoices(): Promise<Invoice[]> {
  // For now, return from API
  return [];
}

export async function getEmployeeInvoices(employee: string): Promise<Invoice[]> {
  return [];
}

export async function getPolicy(): Promise<{ threshold: number; monthlyCap: number }> {
  return { threshold: 5000, monthlyCap: 100000 };
}

export async function getPreferredToken(employee: string): Promise<string | null> {
  return null;
}

export async function isEmployeeRegistered(employee: string): Promise<boolean> {
  return false;
}

// ── Placeholder exports for API routes ──────────────────────────────

export async function submitInvoiceOnChain(params: {
  invoiceHash: string;
  employee: string;
  vendor: string;
  amountCents: number;
  timestamp: number;
}): Promise<{ invoiceId: number; txHash: string }> {
  // TODO: Call Anchor program via RPC
  return { invoiceId: 0, txHash: "placeholder" };
}

export async function approveInvoiceOnChain(invoiceId: number): Promise<string> {
  return "placeholder";
}

export async function batchApproveOnChain(invoiceIds: number[]): Promise<string> {
  return "placeholder";
}

export async function rejectInvoiceOnChain(invoiceId: number): Promise<string> {
  return "placeholder";
}

export async function markPaidOnChain(invoiceId: number, paymentTx: string): Promise<string> {
  return "placeholder";
}

export async function setAutoApproveThreshold(amountCents: number): Promise<string> {
  return "placeholder";
}

export async function setMonthlyCap(amountCents: number): Promise<string> {
  return "placeholder";
}

export async function registerEmployeeOnChain(employee: string, preferredToken: string): Promise<string> {
  return "placeholder";
}

export async function setPreferredTokenOnChain(employee: string, token: string): Promise<string> {
  return "placeholder";
}

export async function mintReceiptNFT(params: {
  employee: string;
  invoiceId: number;
  vendor: string;
  amountCents: number;
  paymentTx: string;
  timestamp: number;
}): Promise<{ txHash: string; tokenId: string }> {
  return { txHash: "placeholder", tokenId: "0" };
}

export async function getEmployeeReceipts(employee: string): Promise<Array<{
  tokenId: number;
  invoiceId: number;
  vendor: string;
  amountCents: number;
  paymentTx: string;
  timestamp: number;
}>> {
  return [];
}

export async function getTreasuryBalance(token: string): Promise<bigint> {
  return 0n;
}

export async function getTotalDisbursed(): Promise<bigint> {
  return 0n;
}
