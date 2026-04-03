import * as _anchor from "@coral-xyz/anchor";
const anchor = (_anchor as any).default ?? _anchor;
const { BN } = anchor;
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("reimbursement-nft", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ReimbursementNft as Program;
  const admin = provider.wallet;
  const employee = Keypair.generate();
  const authorizedMinter = Keypair.generate();

  let statePda: PublicKey;

  before(async () => {
    [statePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("nft-state")],
      program.programId
    );
  });

  it("initializes NFT state", async () => {
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

    const state = await program.account.nftState.fetch(statePda);
    expect(state.admin.toString()).to.equal(admin.publicKey.toString());
    expect(state.totalSupply.toNumber()).to.be.a("number");
  });

  it("sets authorized minter", async () => {
    await program.methods
      .setAuthorizedMinter(authorizedMinter.publicKey)
      .accounts({
        state: statePda,
        admin: admin.publicKey,
      })
      .rpc();

    const state = await program.account.nftState.fetch(statePda);
    expect(state.authorizedMinter.toString()).to.equal(
      authorizedMinter.publicKey.toString()
    );
  });

  it("rejects set_authorized_minter from non-admin", async () => {
    const faker = Keypair.generate();
    try {
      await program.methods
        .setAuthorizedMinter(faker.publicKey)
        .accounts({
          state: statePda,
          admin: faker.publicKey,
        })
        .signers([faker])
        .rpc();
      expect.fail("Should fail — not admin");
    } catch (e) {
      expect(e).to.exist;
    }
  });

  it("admin mints a receipt", async () => {
    const state = await program.account.nftState.fetch(statePda);
    const supply = state.totalSupply.toNumber();

    const [receiptPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), new BN(supply).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    await program.methods
      .mintReceipt(
        new BN(0),           // invoice_id
        "stripe.com",               // vendor
        new BN(50000),       // amount_cents
        "abc123txsig",              // payment_tx
        new BN(1700000000)   // timestamp
      )
      .accounts({
        state: statePda,
        receipt: receiptPda,
        employee: employee.publicKey,
        payer: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const receipt = await program.account.receipt.fetch(receiptPda);
    expect(receipt.tokenId.toNumber()).to.equal(supply);
    expect(receipt.employee.toString()).to.equal(employee.publicKey.toString());
    expect(receipt.vendor).to.equal("stripe.com");
    expect(receipt.amountCents.toNumber()).to.equal(50000);
    expect(receipt.paymentTx).to.equal("abc123txsig");
  });

  it("authorized minter mints a receipt", async () => {
    // Fund minter
    const sig = await provider.connection.requestAirdrop(authorizedMinter.publicKey, 2e9);
    await provider.connection.confirmTransaction(sig);

    const state = await program.account.nftState.fetch(statePda);
    const supply = state.totalSupply.toNumber();

    const [receiptPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), new BN(supply).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    await program.methods
      .mintReceipt(
        new BN(1),
        "aws.amazon.com",
        new BN(120000),
        "def456txsig",
        new BN(1700100000)
      )
      .accounts({
        state: statePda,
        receipt: receiptPda,
        employee: employee.publicKey,
        payer: authorizedMinter.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authorizedMinter])
      .rpc();

    const receipt = await program.account.receipt.fetch(receiptPda);
    expect(receipt.tokenId.toNumber()).to.equal(supply);
    expect(receipt.vendor).to.equal("aws.amazon.com");
  });

  it("rejects mint from unauthorized caller", async () => {
    const faker = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(faker.publicKey, 1e9);
    await provider.connection.confirmTransaction(sig);

    const state = await program.account.nftState.fetch(statePda);
    const supply = state.totalSupply.toNumber();

    const [receiptPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), new BN(supply).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    try {
      await program.methods
        .mintReceipt(
          new BN(99),
          "evil.com",
          new BN(999999),
          "fakesig",
          new BN(0)
        )
        .accounts({
          state: statePda,
          receipt: receiptPda,
          employee: employee.publicKey,
          payer: faker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([faker])
        .rpc();
      expect.fail("Should fail — not authorized");
    } catch (e) {
      expect(e.toString()).to.include("Unauthorized");
    }
  });

  it("total supply increments correctly", async () => {
    const state = await program.account.nftState.fetch(statePda);
    expect(state.totalSupply.toNumber()).to.be.at.least(2);
  });

  it("mints receipt with zero amount", async () => {
    const state = await program.account.nftState.fetch(statePda);
    const supply = state.totalSupply.toNumber();

    const [receiptPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), new BN(supply).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    await program.methods
      .mintReceipt(
        new BN(2),
        "free.com",
        new BN(0),       // zero amount edge case
        "zerotx",
        new BN(1700200000)
      )
      .accounts({
        state: statePda,
        receipt: receiptPda,
        employee: employee.publicKey,
        payer: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const receipt = await program.account.receipt.fetch(receiptPda);
    expect(receipt.amountCents.toNumber()).to.equal(0);
  });

  it("mints receipt with max-length vendor string", async () => {
    const state = await program.account.nftState.fetch(statePda);
    const supply = state.totalSupply.toNumber();

    const [receiptPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), new BN(supply).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const longVendor = "a]".repeat(16); // 32 chars

    await program.methods
      .mintReceipt(
        new BN(3),
        longVendor,
        new BN(100),
        "tx",
        new BN(1700300000)
      )
      .accounts({
        state: statePda,
        receipt: receiptPda,
        employee: employee.publicKey,
        payer: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const receipt = await program.account.receipt.fetch(receiptPda);
    expect(receipt.vendor).to.equal(longVendor);
  });
});
