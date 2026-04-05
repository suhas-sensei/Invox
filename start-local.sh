#!/bin/bash
set -e

export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

echo "=== Invox Local Dev Setup ==="

# 1. Start local validator in background (if not already running)
if ! solana config get | grep -q "localhost"; then
  solana config set --url localhost
fi

if pgrep -x "solana-test-val" > /dev/null; then
  echo "[OK] solana-test-validator already running"
else
  echo "[..] Starting solana-test-validator..."
  solana-test-validator --reset --quiet &
  VALIDATOR_PID=$!
  echo "[OK] Validator PID: $VALIDATOR_PID"
  sleep 3
fi

# Wait for validator to be ready
echo "[..] Waiting for validator..."
for i in $(seq 1 30); do
  if solana cluster-version 2>/dev/null; then
    break
  fi
  sleep 1
done

# 2. Airdrop SOL to admin
echo "[..] Airdropping SOL to admin..."
ADMIN=$(solana address)
echo "     Admin: $ADMIN"
solana airdrop 100 "$ADMIN" 2>/dev/null || true
echo "[OK] Admin balance: $(solana balance)"

# 3. Deploy all programs
echo "[..] Deploying programs..."
cd contracts

anchor build 2>/dev/null || echo "[WARN] anchor build had warnings"
anchor deploy 2>/dev/null && echo "[OK] All programs deployed" || echo "[WARN] Some programs may already be deployed"

# 4. Initialize state accounts
echo "[..] Initializing program state..."
cat > /tmp/init-invox.ts << 'INITEOF'
import * as _anchor from "@coral-xyz/anchor";
const anchor = (_anchor as any).default ?? _anchor;
const { BN } = anchor;
import { PublicKey, SystemProgram } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const admin = provider.wallet;

  // Initialize Invoice Registry
  try {
    const program = anchor.workspace.InvoiceRegistry;
    const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("state")], program.programId);
    await program.methods
      .initialize(new BN(5000), new BN(100000)) // $50 auto-approve, $1000 monthly cap
      .accounts({ state: statePda, admin: admin.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("[OK] Invoice Registry initialized");
  } catch (e: any) {
    if (e.message?.includes("already in use")) console.log("[OK] Invoice Registry already initialized");
    else console.log("[WARN] Invoice Registry:", e.message?.slice(0, 80));
  }

  // Initialize Reimbursement NFT
  try {
    const program = anchor.workspace.ReimbursementNft;
    const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("nft-state")], program.programId);
    await program.methods
      .initialize()
      .accounts({ state: statePda, admin: admin.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("[OK] Reimbursement NFT initialized");
  } catch (e: any) {
    if (e.message?.includes("already in use")) console.log("[OK] Reimbursement NFT already initialized");
    else console.log("[WARN] Reimbursement NFT:", e.message?.slice(0, 80));
  }

  // Initialize Spending Analytics
  try {
    const program = anchor.workspace.SpendingAnalytics;
    const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("analytics")], program.programId);
    await program.methods
      .initialize()
      .accounts({ analytics: statePda, payer: admin.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("[OK] Spending Analytics initialized");
  } catch (e: any) {
    if (e.message?.includes("already in use")) console.log("[OK] Spending Analytics already initialized");
    else console.log("[WARN] Spending Analytics:", e.message?.slice(0, 80));
  }

  // Initialize Multisig Approver
  try {
    const program = anchor.workspace.MultisigApprover;
    const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("multisig")], program.programId);
    await program.methods
      .initialize(2, new BN(100000))
      .accounts({ state: statePda, admin: admin.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("[OK] Multisig Approver initialized");
  } catch (e: any) {
    if (e.message?.includes("already in use")) console.log("[OK] Multisig Approver already initialized");
    else console.log("[WARN] Multisig Approver:", e.message?.slice(0, 80));
  }

  // Initialize Proof Verifier
  try {
    const program = anchor.workspace.ProofVerifier;
    const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("verifier")], program.programId);
    await program.methods
      .initialize()
      .accounts({ state: statePda, admin: admin.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("[OK] Proof Verifier initialized");
  } catch (e: any) {
    if (e.message?.includes("already in use")) console.log("[OK] Proof Verifier already initialized");
    else console.log("[WARN] Proof Verifier:", e.message?.slice(0, 80));
  }

  console.log("\n=== All programs initialized ===");
}

main().catch(console.error);
INITEOF

# Run the init script using ts-mocha's ts-node (available from anchor test deps)
npx ts-node --esm /tmp/init-invox.ts 2>/dev/null || echo "[WARN] Init script had issues (state may already exist)"

cd ..

# 5. Start Next.js frontend
echo ""
echo "=== Starting Next.js frontend ==="
echo "    RPC: http://localhost:8899"
echo "    Web: http://localhost:3000"
echo ""
cd web
npm run dev
