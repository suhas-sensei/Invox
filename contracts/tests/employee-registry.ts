import * as _anchor from "@coral-xyz/anchor";
const anchor = (_anchor as any).default ?? _anchor;
const { BN } = anchor;
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("employee-registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.EmployeeRegistry as Program;
  const admin = provider.wallet;
  const employee1 = Keypair.generate();
  const employee2 = Keypair.generate();
  const preferredToken = Keypair.generate().publicKey;

  it("registers an employee", async () => {
    const [recordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("employee"), employee1.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .registerEmployee(preferredToken)
      .accounts({
        employeeRecord: recordPda,
        employee: employee1.publicKey,
        payer: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const record = await program.account.employeeRecord.fetch(recordPda);
    expect(record.employee.toString()).to.equal(employee1.publicKey.toString());
    expect(record.preferredToken.toString()).to.equal(preferredToken.toString());
    expect(record.registered).to.be.true;
    expect(record.totalReimbursed.toNumber()).to.equal(0);
    expect(record.invoiceCount.toNumber()).to.equal(0);
  });

  it("rejects duplicate registration", async () => {
    const [recordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("employee"), employee1.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .registerEmployee(preferredToken)
        .accounts({
          employeeRecord: recordPda,
          employee: employee1.publicKey,
          payer: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should fail — already registered (PDA exists)");
    } catch (e) {
      expect(e).to.exist;
    }
  });

  it("registers a second employee", async () => {
    const [recordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("employee"), employee2.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .registerEmployee(Keypair.generate().publicKey)
      .accounts({
        employeeRecord: recordPda,
        employee: employee2.publicKey,
        payer: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const record = await program.account.employeeRecord.fetch(recordPda);
    expect(record.employee.toString()).to.equal(employee2.publicKey.toString());
    expect(record.registered).to.be.true;
  });

  it("employee sets preferred token", async () => {
    const newToken = Keypair.generate().publicKey;
    const [recordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("employee"), employee1.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .setPreferredToken(newToken)
      .accounts({
        employeeRecord: recordPda,
        employee: employee1.publicKey,
      })
      .signers([employee1])
      .rpc();

    const record = await program.account.employeeRecord.fetch(recordPda);
    expect(record.preferredToken.toString()).to.equal(newToken.toString());
  });

  it("rejects set_preferred_token from non-employee", async () => {
    const faker = Keypair.generate();
    const [recordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("employee"), faker.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .setPreferredToken(Keypair.generate().publicKey)
        .accounts({
          employeeRecord: recordPda,
          employee: faker.publicKey,
        })
        .signers([faker])
        .rpc();
      expect.fail("Should fail — PDA doesn't exist for unregistered employee");
    } catch (e) {
      expect(e).to.exist;
    }
  });

  it("rejects set_preferred_token with wrong signer", async () => {
    const [recordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("employee"), employee1.publicKey.toBuffer()],
      program.programId
    );

    try {
      // employee2 tries to change employee1's token
      await program.methods
        .setPreferredToken(Keypair.generate().publicKey)
        .accounts({
          employeeRecord: recordPda,
          employee: employee2.publicKey,
        })
        .signers([employee2])
        .rpc();
      expect.fail("Should fail — PDA seed mismatch");
    } catch (e) {
      expect(e).to.exist;
    }
  });
});
