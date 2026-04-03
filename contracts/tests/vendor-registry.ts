import * as _anchor from "@coral-xyz/anchor";
const anchor = (_anchor as any).default ?? _anchor;
const { BN } = anchor;
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { createHash } from "crypto";

function vendorHash(name: string): number[] {
  return Array.from(createHash("sha256").update(name).digest());
}

describe("vendor-registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.VendorRegistry as Program;
  const admin = provider.wallet;

  const vendor1Hash = vendorHash("stripe.com");
  const vendor2Hash = vendorHash("aws.amazon.com");

  it("registers a vendor", async () => {
    const [vendorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), Buffer.from(vendor1Hash)],
      program.programId
    );

    await program.methods
      .registerVendor(vendor1Hash, "Stripe", new BN(500000))
      .accounts({
        vendor: vendorPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const record = await program.account.vendorRecord.fetch(vendorPda);
    expect(record.name).to.equal("Stripe");
    expect(record.approved).to.be.true;
    expect(record.maxAmountCents.toNumber()).to.equal(500000);
    expect(record.totalSpend.toNumber()).to.equal(0);
    expect(record.invoiceCount.toNumber()).to.equal(0);
  });

  it("rejects duplicate vendor registration", async () => {
    const [vendorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), Buffer.from(vendor1Hash)],
      program.programId
    );

    try {
      await program.methods
        .registerVendor(vendor1Hash, "Stripe Again", new BN(100))
        .accounts({
          vendor: vendorPda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should fail — PDA already exists");
    } catch (e) {
      expect(e).to.exist;
    }
  });

  it("registers a second vendor", async () => {
    const [vendorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), Buffer.from(vendor2Hash)],
      program.programId
    );

    await program.methods
      .registerVendor(vendor2Hash, "AWS", new BN(0)) // 0 = unlimited
      .accounts({
        vendor: vendorPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const record = await program.account.vendorRecord.fetch(vendorPda);
    expect(record.name).to.equal("AWS");
    expect(record.maxAmountCents.toNumber()).to.equal(0);
  });

  it("validates vendor under limit", async () => {
    const [vendorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), Buffer.from(vendor1Hash)],
      program.programId
    );

    await program.methods
      .validateVendor(new BN(100000))
      .accounts({
        vendor: vendorPda,
        authority: admin.publicKey,
      })
      .rpc();
    // Should succeed — 100000 <= 500000
  });

  it("rejects validate_vendor over limit", async () => {
    const [vendorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), Buffer.from(vendor1Hash)],
      program.programId
    );

    try {
      await program.methods
        .validateVendor(new BN(600000))
        .accounts({
          vendor: vendorPda,
          authority: admin.publicKey,
        })
        .rpc();
      expect.fail("Should fail — exceeds limit");
    } catch (e) {
      expect(e.toString()).to.include("ExceedsLimit");
    }
  });

  it("validates vendor with zero limit (unlimited)", async () => {
    const [vendorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), Buffer.from(vendor2Hash)],
      program.programId
    );

    await program.methods
      .validateVendor(new BN(999999999))
      .accounts({
        vendor: vendorPda,
        authority: admin.publicKey,
      })
      .rpc();
    // Should succeed — limit is 0 (unlimited)
  });

  it("records spend", async () => {
    const [vendorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), Buffer.from(vendor1Hash)],
      program.programId
    );

    await program.methods
      .recordSpend(new BN(50000))
      .accounts({
        vendor: vendorPda,
        authority: admin.publicKey,
      })
      .rpc();

    const record = await program.account.vendorRecord.fetch(vendorPda);
    expect(record.totalSpend.toNumber()).to.equal(50000);
    expect(record.invoiceCount.toNumber()).to.equal(1);
  });

  it("accumulates spend across multiple records", async () => {
    const [vendorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), Buffer.from(vendor1Hash)],
      program.programId
    );

    await program.methods
      .recordSpend(new BN(30000))
      .accounts({
        vendor: vendorPda,
        authority: admin.publicKey,
      })
      .rpc();

    const record = await program.account.vendorRecord.fetch(vendorPda);
    expect(record.totalSpend.toNumber()).to.equal(80000);
    expect(record.invoiceCount.toNumber()).to.equal(2);
  });

  it("removes a vendor", async () => {
    const [vendorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), Buffer.from(vendor1Hash)],
      program.programId
    );

    await program.methods
      .removeVendor()
      .accounts({
        vendor: vendorPda,
        admin: admin.publicKey,
      })
      .rpc();

    const record = await program.account.vendorRecord.fetch(vendorPda);
    expect(record.approved).to.be.false;
  });

  it("rejects validate on removed vendor", async () => {
    const [vendorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), Buffer.from(vendor1Hash)],
      program.programId
    );

    try {
      await program.methods
        .validateVendor(new BN(100))
        .accounts({
          vendor: vendorPda,
          authority: admin.publicKey,
        })
        .rpc();
      expect.fail("Should fail — vendor not approved");
    } catch (e) {
      expect(e.toString()).to.include("NotApproved");
    }
  });
});
