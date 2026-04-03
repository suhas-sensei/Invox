export interface Invoice {
  id: number;
  invoiceHash: string;
  employee: string;
  vendor: string;
  amountCents: number;
  timestamp: number;
  status: "pending" | "approved" | "paid" | "rejected" | "auto_approved";
  proofVerified: boolean;
  paymentTx: string;
}

export interface RawEmailData {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  rawContent: string;
  vendor: string;
  amountCents: number;
}

export interface ProofResult {
  proofData: unknown;
  publicData: unknown;
  verified: boolean;
  invoiceHash: string;
  vendor: string;
  amountCents: number;
  timestamp: number;
}

export interface PaymentRequest {
  employeeAddress: string;
  amountCents: number;
  preferredToken?: string;
}

const STATUS_MAP: Record<number, Invoice["status"]> = {
  0: "pending",
  1: "approved",
  2: "paid",
  3: "rejected",
  4: "auto_approved",
};

export function parseStatus(raw: number): Invoice["status"] {
  return STATUS_MAP[raw] ?? "pending";
}

export function feltToShortString(felt: bigint): string {
  let hex = felt.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return str;
}

export function shortStringToFelt(str: string): string {
  let hex = "0x";
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}
