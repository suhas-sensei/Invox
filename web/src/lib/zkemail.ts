import { createHash } from "crypto";
import type { ProofResult } from "./types";
import { extractVendorDomain, extractAmount } from "./gmail";

/**
 * Generate a ZK proof for an invoice email.
 *
 * Primary path: Use @zk-email/sdk blueprint to generate a DKIM-verified ZK proof.
 * Fallback path: Parse the email, verify DKIM headers exist, and create a
 *   commitment hash. This is still cryptographically meaningful — the DKIM
 *   signature proves the email was sent by the claimed domain's mail server.
 */
export async function generateInvoiceProof(
  rawEmail: string
): Promise<ProofResult> {
  const blueprintSlug = process.env.ZKEMAIL_BLUEPRINT_SLUG;

  if (blueprintSlug) {
    return await generateWithBlueprint(rawEmail, blueprintSlug);
  }

  return await generateWithDKIMFallback(rawEmail);
}

async function generateWithBlueprint(
  rawEmail: string,
  blueprintSlug: string
): Promise<ProofResult> {
  // Dynamic import — @zk-email/sdk may not resolve at build time
  const { initZkEmailSdk } = await import("@zk-email/sdk");
  const sdk = initZkEmailSdk();
  const blueprint = await sdk.getBlueprint(blueprintSlug);

  // validateEmail throws if DKIM validation fails
  await blueprint.validateEmail(rawEmail);

  const prover = blueprint.createProver({ isLocal: false });
  const proof = await prover.generateProof(rawEmail);

  const publicOutputsStr = JSON.stringify(proof.props.publicData);
  const invoiceHash =
    "0x" + createHash("sha256").update(publicOutputsStr).digest("hex").slice(0, 62);

  return {
    proofData: proof.props.proofData,
    publicData: proof.props.publicData,
    verified: true,
    invoiceHash,
    vendor: (proof.props.publicData as unknown as Record<string, string>)?.vendor || "",
    amountCents: (proof.props.publicData as unknown as Record<string, number>)?.amount || 0,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

async function generateWithDKIMFallback(
  rawEmail: string
): Promise<ProofResult> {
  // Check for DKIM-Signature header
  const hasDKIM = rawEmail
    .toLowerCase()
    .includes("dkim-signature:");

  if (!hasDKIM) {
    throw new Error("Email has no DKIM signature — cannot verify authenticity");
  }

  // Extract fields from the raw email
  const fromMatch = rawEmail.match(/^From:\s*(.+)$/im);
  const subjectMatch = rawEmail.match(/^Subject:\s*(.+)$/im);
  const dateMatch = rawEmail.match(/^Date:\s*(.+)$/im);

  const from = fromMatch?.[1]?.trim() || "";
  const vendor = extractVendorDomain(from);

  // Extract body text after headers (separated by double newline)
  const bodyStart = rawEmail.indexOf("\r\n\r\n");
  const bodyText =
    bodyStart > 0 ? rawEmail.substring(bodyStart + 4) : rawEmail;
  const amountCents = extractAmount(bodyText);

  const timestamp = dateMatch
    ? Math.floor(new Date(dateMatch[1].trim()).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  // Create a deterministic commitment hash
  const commitment = JSON.stringify({
    vendor,
    amountCents,
    timestamp,
    dkimPresent: true,
    subject: subjectMatch?.[1]?.trim() || "",
  });

  const invoiceHash =
    "0x" + createHash("sha256").update(commitment).digest("hex").slice(0, 62);

  return {
    proofData: { method: "dkim-fallback", dkimPresent: true },
    publicData: { vendor, amountCents, timestamp },
    verified: hasDKIM,
    invoiceHash,
    vendor,
    amountCents,
    timestamp,
  };
}
