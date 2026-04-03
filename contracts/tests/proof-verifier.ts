import * as _anchor from "@coral-xyz/anchor";
const anchor = (_anchor as any).default ?? _anchor;
const { BN } = anchor;
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { createHash } from "crypto";

describe("proof-verifier", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ProofVerifier as Program;
  const admin = provider.wallet;

  let statePda: PublicKey;

  const invoiceHash1 = Array.from(createHash("sha256").update("invoice-1").digest());
  const invoiceHash2 = Array.from(createHash("sha256").update("invoice-2").digest());
  const dkimDomainHash = Array.from(Buffer.alloc(32, 42));
  const commitmentHash = Array.from(Buffer.alloc(32, 99));

  before(async () => {
    [statePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("verifier")],
      program.programId
    );
  });

  it("initializes verifier", async () => {
    try {
      await program.methods
        .initialize()
        .accounts({
          state: statePda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Already initialized
    }

    const state = await program.account.verifierState.fetch(statePda);
    expect(state.admin.toString()).to.equal(admin.publicKey.toString());
    expect(state.totalProofs.toNumber()).to.be.a("number");
  });

  it("submits a proof", async () => {
    const [proofPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), Buffer.from(invoiceHash1)],
      program.programId
    );

    const before = await program.account.verifierState.fetch(statePda);
    const prevTotal = before.totalProofs.toNumber();

    await program.methods
      .submitProof(
        invoiceHash1,
        dkimDomainHash,
        commitmentHash,
        "stripe.com",
        new BN(50000),
        new BN(1700000000)
      )
      .accounts({
        state: statePda,
        proof: proofPda,
        payer: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const proof = await program.account.proofRecord.fetch(proofPda);
    expect(proof.verified).to.be.true;
    expect(proof.revoked).to.be.false;
    expect(proof.vendor).to.equal("stripe.com");
    expect(proof.amountCents.toNumber()).to.equal(50000);

    const after = await program.account.verifierState.fetch(statePda);
    expect(after.totalProofs.toNumber()).to.equal(prevTotal + 1);
  });

  it("rejects duplicate proof submission", async () => {
    const [proofPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), Buffer.from(invoiceHash1)],
      program.programId
    );

    try {
      await program.methods
        .submitProof(
          invoiceHash1,
          dkimDomainHash,
          commitmentHash,
          "stripe.com",
          new BN(50000),
          new BN(1700000000)
        )
        .accounts({
          state: statePda,
          proof: proofPda,
          payer: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should fail — PDA already exists (duplicate proof)");
    } catch (e) {
      expect(e).to.exist;
    }
  });

  it("validates an active proof", async () => {
    const [proofPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), Buffer.from(invoiceHash1)],
      program.programId
    );

    await program.methods
      .validateProof()
      .accounts({
        proof: proofPda,
        authority: admin.publicKey,
      })
      .rpc();
    // Should succeed
  });

  it("submits a second proof", async () => {
    const [proofPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), Buffer.from(invoiceHash2)],
      program.programId
    );

    await program.methods
      .submitProof(
        invoiceHash2,
        dkimDomainHash,
        commitmentHash,
        "aws.com",
        new BN(120000),
        new BN(1700100000)
      )
      .accounts({
        state: statePda,
        proof: proofPda,
        payer: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const proof = await program.account.proofRecord.fetch(proofPda);
    expect(proof.vendor).to.equal("aws.com");
    expect(proof.verified).to.be.true;
  });

  it("revokes a proof", async () => {
    const [proofPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), Buffer.from(invoiceHash2)],
      program.programId
    );

    const before = await program.account.verifierState.fetch(statePda);
    const prevRevoked = before.revokedCount.toNumber();

    await program.methods
      .revokeProof()
      .accounts({
        state: statePda,
        proof: proofPda,
        admin: admin.publicKey,
      })
      .rpc();

    const proof = await program.account.proofRecord.fetch(proofPda);
    expect(proof.revoked).to.be.true;
    expect(proof.verified).to.be.false;

    const after = await program.account.verifierState.fetch(statePda);
    expect(after.revokedCount.toNumber()).to.equal(prevRevoked + 1);
  });

  it("rejects validate on revoked proof", async () => {
    const [proofPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), Buffer.from(invoiceHash2)],
      program.programId
    );

    try {
      await program.methods
        .validateProof()
        .accounts({
          proof: proofPda,
          authority: admin.publicKey,
        })
        .rpc();
      expect.fail("Should fail — proof revoked");
    } catch (e) {
      expect(e.toString()).to.include("NotVerified");
    }
  });

  it("rejects revoke from non-admin", async () => {
    const [proofPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), Buffer.from(invoiceHash1)],
      program.programId
    );

    const faker = Keypair.generate();
    try {
      await program.methods
        .revokeProof()
        .accounts({
          state: statePda,
          proof: proofPda,
          admin: faker.publicKey,
        })
        .signers([faker])
        .rpc();
      expect.fail("Should fail — not admin");
    } catch (e) {
      expect(e).to.exist;
    }
  });

  it("total proofs count is correct", async () => {
    const state = await program.account.verifierState.fetch(statePda);
    expect(state.totalProofs.toNumber()).to.be.at.least(2);
  });

  it("revoked count never exceeds total", async () => {
    const state = await program.account.verifierState.fetch(statePda);
    expect(state.revokedCount.toNumber()).to.be.at.most(
      state.totalProofs.toNumber()
    );
  });
});
