import * as _anchor from "@coral-xyz/anchor";
const anchor = (_anchor as any).default ?? _anchor;
const { BN } = anchor;
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { createHash } from "crypto";

// Helper: compute invoice hash matching on-chain logic
function computeInvoiceHash(
  vendor: string,
  amountCents: number,
  timestamp: number,
  dkimDomainHash: Buffer
): Buffer {
  const buf = Buffer.alloc(vendor.length + 8 + 8 + 32);
  let offset = 0;
  buf.write(vendor, offset);
  offset += vendor.length;
  buf.writeBigUInt64LE(BigInt(amountCents), offset);
  offset += 8;
  buf.writeBigInt64LE(BigInt(timestamp), offset);
  offset += 8;
  dkimDomainHash.copy(buf, offset);
  return createHash("sha256").update(buf).digest();
}

describe("invoice-registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.InvoiceRegistry as Program;
  const admin = provider.wallet;
  const employee = Keypair.generate();

  let statePda: PublicKey;
  let stateBump: number;

  before(async () => {
    [statePda, stateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );
  });

  it("initializes the registry", async () => {
    try {
      await program.methods
        .initialize(new BN(10000), new BN(500000))
        .accounts({
          state: statePda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Already initialized from previous run
    }

    const state = await program.account.registryState.fetch(statePda);
    expect(state.admin.toString()).to.equal(admin.publicKey.toString());
    expect(state.invoiceCount.toNumber()).to.be.a("number");
  });

  it("rejects initialization by non-admin", async () => {
    const faker = Keypair.generate();
    const [fakePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );
    try {
      await program.methods
        .initialize(new BN(0), new BN(0))
        .accounts({
          state: fakePda,
          admin: faker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([faker])
        .rpc();
      expect.fail("Should have failed — PDA already initialized");
    } catch (e) {
      expect(e).to.exist;
    }
  });

  it("sets auto-approve threshold", async () => {
    await program.methods
      .setAutoApproveThreshold(new BN(25000))
      .accounts({
        state: statePda,
        admin: admin.publicKey,
      })
      .rpc();

    const state = await program.account.registryState.fetch(statePda);
    expect(state.autoApproveThreshold.toNumber()).to.equal(25000);
  });

  it("sets monthly cap", async () => {
    await program.methods
      .setMonthlyCap(new BN(1000000))
      .accounts({
        state: statePda,
        admin: admin.publicKey,
      })
      .rpc();

    const state = await program.account.registryState.fetch(statePda);
    expect(state.monthlyCap.toNumber()).to.equal(1000000);
  });

  it("rejects setAutoApproveThreshold from non-admin", async () => {
    const faker = Keypair.generate();
    try {
      await program.methods
        .setAutoApproveThreshold(new BN(0))
        .accounts({
          state: statePda,
          admin: faker.publicKey,
        })
        .signers([faker])
        .rpc();
      expect.fail("Should have failed — not admin");
    } catch (e) {
      expect(e).to.exist;
    }
  });

  it("submits an invoice with valid proof hash", async () => {
    const vendor = "stripe.com";
    const amountCents = 5000;
    const timestamp = 1700000000;
    const dkimDomainHash = Buffer.alloc(32, 42);

    const invoiceHash = computeInvoiceHash(
      vendor,
      amountCents,
      timestamp,
      dkimDomainHash
    );

    const state = await program.account.registryState.fetch(statePda);
    const invoiceCount = state.invoiceCount.toNumber();

    const [invoicePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("invoice"),
        new BN(invoiceCount).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const [dedupPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("dedup"), invoiceHash],
      program.programId
    );

    const month = Math.floor(timestamp / 2592000);
    const monthBuf = Buffer.alloc(2);
    monthBuf.writeUInt16LE(month);
    const [monthlyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("monthly"), employee.publicKey.toBuffer(), monthBuf],
      program.programId
    );

    await program.methods
      .submitInvoice(
        Array.from(invoiceHash),
        vendor,
        new BN(amountCents),
        new BN(timestamp),
        Array.from(dkimDomainHash)
      )
      .accounts({
        state: statePda,
        invoice: invoicePda,
        dedup: dedupPda,
        monthlySpend: monthlyPda,
        employee: employee.publicKey,
        payer: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const invoice = await program.account.invoice.fetch(invoicePda);
    expect(invoice.amountCents.toNumber()).to.equal(amountCents);
    expect(invoice.vendor).to.equal(vendor);
    // Under threshold (5000 <= 25000) → auto-approved
    expect(invoice.status).to.equal(4); // STATUS_AUTO_APPROVED
  });

  it("rejects duplicate invoice hash", async () => {
    const vendor = "stripe.com";
    const amountCents = 5000;
    const timestamp = 1700000000;
    const dkimDomainHash = Buffer.alloc(32, 42);

    const invoiceHash = computeInvoiceHash(
      vendor,
      amountCents,
      timestamp,
      dkimDomainHash
    );

    const state = await program.account.registryState.fetch(statePda);
    const invoiceCount = state.invoiceCount.toNumber();

    const [invoicePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("invoice"),
        new BN(invoiceCount).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const [dedupPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("dedup"), invoiceHash],
      program.programId
    );

    const month = Math.floor(timestamp / 2592000);
    const monthBuf = Buffer.alloc(2);
    monthBuf.writeUInt16LE(month);
    const [monthlyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("monthly"), employee.publicKey.toBuffer(), monthBuf],
      program.programId
    );

    try {
      await program.methods
        .submitInvoice(
          Array.from(invoiceHash),
          vendor,
          new BN(amountCents),
          new BN(timestamp),
          Array.from(dkimDomainHash)
        )
        .accounts({
          state: statePda,
          invoice: invoicePda,
          dedup: dedupPda,
          monthlySpend: monthlyPda,
          employee: employee.publicKey,
          payer: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have failed — duplicate hash");
    } catch (e) {
      expect(e).to.exist;
    }
  });

  it("submits invoice above threshold as pending", async () => {
    const vendor = "aws.amazon.com";
    const amountCents = 50000; // above 25000 threshold
    const timestamp = 1700100000;
    const dkimDomainHash = Buffer.alloc(32, 99);

    const invoiceHash = computeInvoiceHash(
      vendor,
      amountCents,
      timestamp,
      dkimDomainHash
    );

    const state = await program.account.registryState.fetch(statePda);
    const invoiceCount = state.invoiceCount.toNumber();

    const [invoicePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("invoice"),
        new BN(invoiceCount).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [dedupPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("dedup"), invoiceHash],
      program.programId
    );
    const month = Math.floor(timestamp / 2592000);
    const monthBuf = Buffer.alloc(2);
    monthBuf.writeUInt16LE(month);
    const [monthlyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("monthly"), employee.publicKey.toBuffer(), monthBuf],
      program.programId
    );

    await program.methods
      .submitInvoice(
        Array.from(invoiceHash),
        vendor,
        new BN(amountCents),
        new BN(timestamp),
        Array.from(dkimDomainHash)
      )
      .accounts({
        state: statePda,
        invoice: invoicePda,
        dedup: dedupPda,
        monthlySpend: monthlyPda,
        employee: employee.publicKey,
        payer: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const invoice = await program.account.invoice.fetch(invoicePda);
    expect(invoice.status).to.equal(0); // STATUS_PENDING
  });

  it("approves a pending invoice", async () => {
    const state = await program.account.registryState.fetch(statePda);
    const lastId = state.invoiceCount.toNumber() - 1;

    const [invoicePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("invoice"),
        new BN(lastId).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .approveInvoice()
      .accounts({
        state: statePda,
        invoice: invoicePda,
        admin: admin.publicKey,
      })
      .rpc();

    const invoice = await program.account.invoice.fetch(invoicePda);
    expect(invoice.status).to.equal(1); // STATUS_APPROVED
  });

  it("rejects approve on non-pending invoice", async () => {
    const state = await program.account.registryState.fetch(statePda);
    const lastId = state.invoiceCount.toNumber() - 1;

    const [invoicePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("invoice"),
        new BN(lastId).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    try {
      await program.methods
        .approveInvoice()
        .accounts({
          state: statePda,
          invoice: invoicePda,
          admin: admin.publicKey,
        })
        .rpc();
      expect.fail("Should fail — already approved");
    } catch (e) {
      expect(e.toString()).to.include("NotPending");
    }
  });

  it("marks an approved invoice as paid", async () => {
    const state = await program.account.registryState.fetch(statePda);
    const lastId = state.invoiceCount.toNumber() - 1;

    const [invoicePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("invoice"),
        new BN(lastId).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .markPaid("5abc123def456ghi789jkl012mno345pqr678stu901vwx234yz")
      .accounts({
        state: statePda,
        invoice: invoicePda,
        authority: admin.publicKey,
      })
      .rpc();

    const invoice = await program.account.invoice.fetch(invoicePda);
    expect(invoice.status).to.equal(2); // STATUS_PAID
    expect(invoice.paymentTx).to.not.be.empty;
  });

  it("rejects mark_paid on pending invoice", async () => {
    // Submit a new invoice that stays pending
    const vendor = "gcp.google.com";
    const amountCents = 80000;
    const timestamp = 1700200000;
    const dkimDomainHash = Buffer.alloc(32, 77);
    const invoiceHash = computeInvoiceHash(vendor, amountCents, timestamp, dkimDomainHash);

    const state = await program.account.registryState.fetch(statePda);
    const invoiceCount = state.invoiceCount.toNumber();

    const [invoicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("invoice"), new BN(invoiceCount).toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [dedupPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("dedup"), invoiceHash],
      program.programId
    );
    const month = Math.floor(timestamp / 2592000);
    const monthBuf = Buffer.alloc(2);
    monthBuf.writeUInt16LE(month);
    const [monthlyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("monthly"), employee.publicKey.toBuffer(), monthBuf],
      program.programId
    );

    await program.methods
      .submitInvoice(Array.from(invoiceHash), vendor, new BN(amountCents), new BN(timestamp), Array.from(dkimDomainHash))
      .accounts({ state: statePda, invoice: invoicePda, dedup: dedupPda, monthlySpend: monthlyPda, employee: employee.publicKey, payer: admin.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    try {
      await program.methods
        .markPaid("fakesig")
        .accounts({ state: statePda, invoice: invoicePda, authority: admin.publicKey })
        .rpc();
      expect.fail("Should fail — not approved");
    } catch (e) {
      expect(e.toString()).to.include("NotApproved");
    }
  });

  it("rejects invoice submission with wrong proof hash", async () => {
    const vendor = "wrong.com";
    const amountCents = 1000;
    const timestamp = 1700300000;
    const dkimDomainHash = Buffer.alloc(32, 11);
    const fakeHash = Buffer.alloc(32, 0); // wrong hash

    const state = await program.account.registryState.fetch(statePda);
    const invoiceCount = state.invoiceCount.toNumber();

    const [invoicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("invoice"), new BN(invoiceCount).toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [dedupPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("dedup"), fakeHash],
      program.programId
    );
    const month = Math.floor(timestamp / 2592000);
    const monthBuf = Buffer.alloc(2);
    monthBuf.writeUInt16LE(month);
    const [monthlyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("monthly"), employee.publicKey.toBuffer(), monthBuf],
      program.programId
    );

    try {
      await program.methods
        .submitInvoice(Array.from(fakeHash), vendor, new BN(amountCents), new BN(timestamp), Array.from(dkimDomainHash))
        .accounts({ state: statePda, invoice: invoicePda, dedup: dedupPda, monthlySpend: monthlyPda, employee: employee.publicKey, payer: admin.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      expect.fail("Should fail — proof invalid");
    } catch (e) {
      expect(e).to.exist;
    }
  });

  it("batch_approve sets pending invoice to approved", async () => {
    // Use the pending invoice from the mark_paid rejection test
    const state = await program.account.registryState.fetch(statePda);
    const pendingId = state.invoiceCount.toNumber() - 1;

    const [invoicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("invoice"), new BN(pendingId).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    await program.methods
      .batchApprove()
      .accounts({ state: statePda, invoice: invoicePda, admin: admin.publicKey })
      .rpc();

    const invoice = await program.account.invoice.fetch(invoicePda);
    expect(invoice.status).to.equal(1); // STATUS_APPROVED
  });

  it("reject_invoice sets pending to rejected", async () => {
    // Submit another pending invoice
    const vendor = "reject.test";
    const amountCents = 99000;
    const timestamp = 1700400000;
    const dkimDomainHash = Buffer.alloc(32, 55);
    const invoiceHash = computeInvoiceHash(vendor, amountCents, timestamp, dkimDomainHash);

    const state = await program.account.registryState.fetch(statePda);
    const invoiceCount = state.invoiceCount.toNumber();

    const [invoicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("invoice"), new BN(invoiceCount).toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [dedupPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("dedup"), invoiceHash],
      program.programId
    );
    const month = Math.floor(timestamp / 2592000);
    const monthBuf = Buffer.alloc(2);
    monthBuf.writeUInt16LE(month);
    const [monthlyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("monthly"), employee.publicKey.toBuffer(), monthBuf],
      program.programId
    );

    await program.methods
      .submitInvoice(Array.from(invoiceHash), vendor, new BN(amountCents), new BN(timestamp), Array.from(dkimDomainHash))
      .accounts({ state: statePda, invoice: invoicePda, dedup: dedupPda, monthlySpend: monthlyPda, employee: employee.publicKey, payer: admin.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await program.methods
      .rejectInvoice()
      .accounts({ state: statePda, invoice: invoicePda, admin: admin.publicKey })
      .rpc();

    const invoice = await program.account.invoice.fetch(invoicePda);
    expect(invoice.status).to.equal(3); // STATUS_REJECTED
  });
});
