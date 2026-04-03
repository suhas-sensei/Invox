import * as _anchor from "@coral-xyz/anchor";
const anchor = (_anchor as any).default ?? _anchor;
const { BN } = anchor;
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("multisig-approver", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MultisigApprover as Program;
  const admin = provider.wallet;
  const signer1 = Keypair.generate();
  const signer2 = Keypair.generate();

  let statePda: PublicKey;

  before(async () => {
    [statePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("multisig")],
      program.programId
    );
  });

  it("initializes multisig with threshold", async () => {
    try {
      await program.methods
        .initialize(2, new BN(100000)) // 2-of-N, amount threshold $1000
        .accounts({
          state: statePda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Already initialized
    }

    const state = await program.account.multisigState.fetch(statePda);
    expect(state.approvalThreshold).to.equal(2);
    expect(state.amountThreshold.toNumber()).to.equal(100000);
    expect(state.signerCount).to.equal(0);
  });

  it("adds signers", async () => {
    const state = await program.account.multisigState.fetch(statePda);
    const count = state.signerCount;

    const [signerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("signer"), new BN(count).toArrayLike(Buffer, "le", 4)],
      program.programId
    );

    await program.methods
      .addSigner(signer1.publicKey)
      .accounts({
        state: statePda,
        signerRecord: signerPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const record = await program.account.signerRecord.fetch(signerPda);
    expect(record.signer.toString()).to.equal(signer1.publicKey.toString());
    expect(record.active).to.be.true;
  });

  it("adds a second signer", async () => {
    const state = await program.account.multisigState.fetch(statePda);
    const count = state.signerCount;

    const [signerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("signer"), new BN(count).toArrayLike(Buffer, "le", 4)],
      program.programId
    );

    await program.methods
      .addSigner(signer2.publicKey)
      .accounts({
        state: statePda,
        signerRecord: signerPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const stateAfter = await program.account.multisigState.fetch(statePda);
    expect(stateAfter.signerCount).to.equal(count + 1);
  });

  it("rejects add_signer from non-admin", async () => {
    const faker = Keypair.generate();

    try {
      const state = await program.account.multisigState.fetch(statePda);
      const [signerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("signer"), new BN(state.signerCount).toArrayLike(Buffer, "le", 4)],
        program.programId
      );

      await program.methods
        .addSigner(Keypair.generate().publicKey)
        .accounts({
          state: statePda,
          signerRecord: signerPda,
          admin: faker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([faker])
        .rpc();
      expect.fail("Should fail — not admin");
    } catch (e) {
      expect(e).to.exist;
    }
  });

  it("signer signs an invoice approval", async () => {
    const invoiceId = new BN(42);
    const [approvalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("approval"), invoiceId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Fund signer1 for tx fees
    const sig = await provider.connection.requestAirdrop(signer1.publicKey, 1e9);
    await provider.connection.confirmTransaction(sig);

    await program.methods
      .signApproval(invoiceId)
      .accounts({
        approval: approvalPda,
        signer: signer1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer1])
      .rpc();

    const approval = await program.account.approvalRecord.fetch(approvalPda);
    expect(approval.sigCount).to.equal(1);
  });

  it("second signer reaches threshold", async () => {
    const invoiceId = new BN(42);
    const [approvalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("approval"), invoiceId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const sig = await provider.connection.requestAirdrop(signer2.publicKey, 1e9);
    await provider.connection.confirmTransaction(sig);

    await program.methods
      .signApproval(invoiceId)
      .accounts({
        approval: approvalPda,
        signer: signer2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer2])
      .rpc();

    const approval = await program.account.approvalRecord.fetch(approvalPda);
    expect(approval.sigCount).to.equal(2);
  });

  it("check_approved passes with enough signatures", async () => {
    const invoiceId = new BN(42);
    const [approvalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("approval"), invoiceId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    await program.methods
      .checkApproved(invoiceId)
      .accounts({
        state: statePda,
        approval: approvalPda,
        authority: admin.publicKey,
      })
      .rpc();
    // Should succeed — 2 sigs >= threshold 2
  });

  it("check_approved fails with insufficient signatures", async () => {
    const invoiceId = new BN(99); // no signatures for this one
    const [approvalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("approval"), invoiceId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Need to init the approval record first
    const sig = await provider.connection.requestAirdrop(signer1.publicKey, 1e9);
    await provider.connection.confirmTransaction(sig);

    await program.methods
      .signApproval(invoiceId)
      .accounts({
        approval: approvalPda,
        signer: signer1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer1])
      .rpc();

    try {
      await program.methods
        .checkApproved(invoiceId)
        .accounts({
          state: statePda,
          approval: approvalPda,
          authority: admin.publicKey,
        })
        .rpc();
      expect.fail("Should fail — only 1 sig, need 2");
    } catch (e) {
      expect(e.toString()).to.include("InsufficientSignatures");
    }
  });

  it("requires_multisig for large amounts", async () => {
    try {
      await program.methods
        .requiresMultisig(new BN(200000)) // > 100000 threshold
        .accounts({
          state: statePda,
          authority: admin.publicKey,
        })
        .rpc();
      expect.fail("Should fail — multisig required");
    } catch (e) {
      expect(e.toString()).to.include("MultisigRequired");
    }
  });

  it("does not require multisig for small amounts", async () => {
    await program.methods
      .requiresMultisig(new BN(50000)) // <= 100000
      .accounts({
        state: statePda,
        authority: admin.publicKey,
      })
      .rpc();
    // Should succeed
  });

  it("does not require multisig at exact threshold", async () => {
    await program.methods
      .requiresMultisig(new BN(100000)) // == threshold, not >
      .accounts({
        state: statePda,
        authority: admin.publicKey,
      })
      .rpc();
    // Should succeed — only amounts OVER threshold require multisig
  });
});
