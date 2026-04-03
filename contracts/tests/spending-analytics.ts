import * as _anchor from "@coral-xyz/anchor";
const anchor = (_anchor as any).default ?? _anchor;
const { BN } = anchor;
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("spending-analytics", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SpendingAnalytics as Program;
  const admin = provider.wallet;

  let analyticsPda: PublicKey;

  before(async () => {
    [analyticsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("analytics")],
      program.programId
    );
  });

  it("initializes analytics", async () => {
    try {
      await program.methods
        .initialize()
        .accounts({
          analytics: analyticsPda,
          payer: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Already initialized
    }

    const analytics = await program.account.analytics.fetch(analyticsPda);
    expect(analytics.totalSubmitted.toNumber()).to.be.a("number");
    expect(analytics.totalApproved.toNumber()).to.be.a("number");
  });

  it("records a submission", async () => {
    const before = await program.account.analytics.fetch(analyticsPda);
    const prevSubmitted = before.totalSubmitted.toNumber();
    const prevAmount = before.totalAmountSubmitted.toNumber();

    await program.methods
      .recordSubmission(new BN(50000))
      .accounts({
        analytics: analyticsPda,
        authority: admin.publicKey,
      })
      .rpc();

    const after = await program.account.analytics.fetch(analyticsPda);
    expect(after.totalSubmitted.toNumber()).to.equal(prevSubmitted + 1);
    expect(after.totalAmountSubmitted.toNumber()).to.equal(prevAmount + 50000);
  });

  it("records an approval", async () => {
    const before = await program.account.analytics.fetch(analyticsPda);
    const prev = before.totalApproved.toNumber();

    await program.methods
      .recordApproval()
      .accounts({
        analytics: analyticsPda,
        authority: admin.publicKey,
      })
      .rpc();

    const after = await program.account.analytics.fetch(analyticsPda);
    expect(after.totalApproved.toNumber()).to.equal(prev + 1);
  });

  it("records a payment", async () => {
    const before = await program.account.analytics.fetch(analyticsPda);
    const prevPaid = before.totalPaid.toNumber();
    const prevAmount = before.totalAmountPaid.toNumber();

    await program.methods
      .recordPayment(new BN(50000))
      .accounts({
        analytics: analyticsPda,
        authority: admin.publicKey,
      })
      .rpc();

    const after = await program.account.analytics.fetch(analyticsPda);
    expect(after.totalPaid.toNumber()).to.equal(prevPaid + 1);
    expect(after.totalAmountPaid.toNumber()).to.equal(prevAmount + 50000);
  });

  it("records a rejection", async () => {
    const before = await program.account.analytics.fetch(analyticsPda);
    const prev = before.totalRejected.toNumber();

    await program.methods
      .recordRejection()
      .accounts({
        analytics: analyticsPda,
        authority: admin.publicKey,
      })
      .rpc();

    const after = await program.account.analytics.fetch(analyticsPda);
    expect(after.totalRejected.toNumber()).to.equal(prev + 1);
  });

  it("records multiple submissions in sequence", async () => {
    const before = await program.account.analytics.fetch(analyticsPda);
    const prevCount = before.totalSubmitted.toNumber();
    const prevAmount = before.totalAmountSubmitted.toNumber();

    const amounts = [10000, 20000, 30000];
    for (const amt of amounts) {
      await program.methods
        .recordSubmission(new BN(amt))
        .accounts({
          analytics: analyticsPda,
          authority: admin.publicKey,
        })
        .rpc();
    }

    const after = await program.account.analytics.fetch(analyticsPda);
    expect(after.totalSubmitted.toNumber()).to.equal(prevCount + 3);
    expect(after.totalAmountSubmitted.toNumber()).to.equal(prevAmount + 60000);
  });

  it("records zero-amount submission", async () => {
    const before = await program.account.analytics.fetch(analyticsPda);
    const prevCount = before.totalSubmitted.toNumber();
    const prevAmount = before.totalAmountSubmitted.toNumber();

    await program.methods
      .recordSubmission(new BN(0))
      .accounts({
        analytics: analyticsPda,
        authority: admin.publicKey,
      })
      .rpc();

    const after = await program.account.analytics.fetch(analyticsPda);
    expect(after.totalSubmitted.toNumber()).to.equal(prevCount + 1);
    expect(after.totalAmountSubmitted.toNumber()).to.equal(prevAmount); // unchanged
  });

  it("records large amount", async () => {
    await program.methods
      .recordSubmission(new BN("1000000000000"))
      .accounts({
        analytics: analyticsPda,
        authority: admin.publicKey,
      })
      .rpc();
    // Should not overflow
  });

  it("all counters are consistent", async () => {
    const a = await program.account.analytics.fetch(analyticsPda);
    // paid + pending should not exceed submitted
    expect(a.totalPaid.toNumber()).to.be.at.most(a.totalSubmitted.toNumber());
    expect(a.totalApproved.toNumber()).to.be.at.most(a.totalSubmitted.toNumber());
    expect(a.totalAmountPaid.toNumber()).to.be.at.most(
      a.totalAmountSubmitted.toNumber()
    );
  });
});
