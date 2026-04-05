# Invox

**ZK-powered corporate invoice verification and reimbursement on Solana**

Employees link their Gmail, Invox scans for vendor invoices, generates DKIM-verified ZK proofs without exposing email content, and submits them on-chain. Admins approve, pay, and mint receipt NFTs — all powered by MagicBlock Ephemeral Rollups and Private Payments.

---

## Architecture

```
                                    INVOX ARCHITECTURE
                                    
    Employee                          Server                           Solana Devnet
    --------                          ------                           ------------
                                      
    [Phantom Wallet] ----connect----> [Next.js App]
                                          |
    [Gmail Inbox]  ---OAuth/DKIM--->  [ZK-Email Proof Engine]
                                          |
                                          v
                                    +-----------+       +---------------------------+
                                    | Proof     |       |   8 Anchor Programs       |
                                    | Generate  |------>|                           |
                                    +-----------+       |  invoice-registry         |
                                          |             |  employee-registry        |
                                          |             |  treasury                 |
                                          |             |  vendor-registry          |
                                          |             |  multisig-approver        |
                                          |             |  reimbursement-nft        |
                                          |             |  spending-analytics       |
                                          |             |  proof-verifier           |
                                          |             +---------------------------+
                                          |                        |
                                          v                        v
                                    +-----------+       +---------------------------+
                                    | MagicBlock|       |   On-Chain State           |
                                    | Private   |       |                           |
                                    | Payments  |       |  - Invoice PDAs           |
                                    +-----------+       |  - Employee records       |
                                          |             |  - Receipt NFTs           |
                                          |             |  - Policy engine          |
                                          |             |  - Monthly spend caps     |
                                          v             |  - Dedup records          |
                                    +-----------+       +---------------------------+
                                    | Jupiter   |
                                    | Auto-Swap |
                                    | SOL->USDC |
                                    +-----------+
```

---

## Ephemeral Rollup Integration

```
    BATCH PAY FLOW (N invoices)
    
    Without ER:                          With MagicBlock ER:
    ============                         ====================
    
    approve_1  ~400ms                    +-- Delegate PDAs to ER --+
    pay_1      ~400ms                    |                         |
    mark_paid_1 ~400ms                   |  approve_1    ~50ms     |
    mint_nft_1  ~400ms                   |  pay_1        ~50ms     |
    approve_2  ~400ms                    |  mark_paid_1  ~50ms     |
    pay_2      ~400ms                    |  mint_nft_1   ~50ms     |
    mark_paid_2 ~400ms                   |  approve_2    ~50ms     |
    mint_nft_2  ~400ms                   |  pay_2        ~50ms     |
    ...                                  |  mark_paid_2  ~50ms     |
    Total: 4N x 400ms                    |  mint_nft_2   ~50ms     |
    = 3200ms for 2 invoices              |  ...                    |
                                         +-- Commit to L1 --------+
                                         
                                         Total: 4N x 50ms + settle
                                         = ~500ms for 2 invoices
                                         = 6x faster
```

```
    ER SESSION LIFECYCLE
    
    Solana L1                    Ephemeral Rollup               Solana L1
    =========                    ================               =========
    
    Invoice PDA #0 ──delegate──> [Copy in ER]
    Invoice PDA #1 ──delegate──> [Copy in ER]
    NFT State PDA  ──delegate──> [Copy in ER]
                                      |
                                 approve_invoice(0)
                                 approve_invoice(1)
                                 pay + mark_paid(0)
                                 pay + mark_paid(1)
                                 mint_receipt(0)
                                 mint_receipt(1)
                                      |
                                 commit & undelegate ────> Updated Invoice PDA #0
                                                           Updated Invoice PDA #1
                                                           New Receipt NFTs
                                                           All on L1, final
```

---

## Payment Flow

```
    EMPLOYEE SELECTS: USDC
    
    Admin Treasury (SOL)
         |
         v
    +------------------+
    | Jupiter Swap API |  SOL --> USDC (mainnet)
    +------------------+  (falls back to SOL on devnet)
         |
         v
    +------------------+
    | MagicBlock       |  Confidential SPL transfer
    | Private Payments |  Amount + recipient shielded
    +------------------+
         |
         v
    Employee Wallet (USDC)
```

---

## ZK-Email Proof Flow

```
    Gmail Inbox
         |
    [OAuth scan for vendor invoices]
         |
         v
    Raw Email (DKIM signed by vendor mail server)
         |
    +--------------------+
    | ZK-Email SDK       |  Primary: full ZK proof via blueprint
    | DKIM Fallback      |  Fallback: verify DKIM header exists
    +--------------------+
         |
         v
    invoice_hash = SHA256(vendor + amount + timestamp + dkim_domain_hash)
         |
    +--------------------+
    | Invoice Registry   |  On-chain hash recomputation
    | (Anchor program)   |  Dedup check via PDA
    +--------------------+  Auto-approve if < threshold
         |                  Monthly cap enforcement
         v
    Invoice PDA created on Solana
    Status: auto_approved | pending
```

---

## Programs (Solana Devnet)

| Program | Address | Purpose |
|---------|---------|---------|
| Invoice Registry | `51fkQxX7Sce6L3M9vbrHoDppo7oLjLES63Yq5C7Z6qx2` | Submit, approve, reject, pay invoices |
| Employee Registry | `FErGeseBj3u79FUhFS7ZeDFByy3m9Yqh3BoDjXhNAUMu` | Employee records + token preferences |
| Treasury | `H4nwxmWmhwDRkynP3NWSP3r7194QDjb8wa5WYTo6P2ww` | SPL token disbursement |
| Vendor Registry | `Cfi1HFakeABZCDo6CM282UdyYqUrsXQNgU5G4BsLwfpn` | Approved vendors + spend limits |
| Multisig Approver | `AqUT256tsQkFHz1aunEfYhoLSPwWLX2wmNPrBVk6uq8X` | M-of-N approval for large invoices |
| Reimbursement NFT | `2Q2CHrNbzz5U4RDXHmKhkMcQCapBebZ5AAqkC1RtpUEJ` | Receipt NFTs minted on payment |
| Spending Analytics | `GmBdHPG8SqkPQJ57p3JpRq1GzMkwF8mUfo74qCdLGneD` | On-chain spending metrics |
| Proof Verifier | `5HoMpmNPb6qsGAHwUMFRBheRtVgMZQVmkjRSurbpeHy3` | ZK proof records + revocation |

---

## Tech Stack

- **Blockchain:** Solana (Devnet) + Anchor 0.32.1
- **Rollups:** MagicBlock Ephemeral Rollups (batch invoice processing)
- **Payments:** MagicBlock Private Payments (confidential SPL transfers)
- **Swap:** Jupiter Aggregator (SOL -> employee's preferred token)
- **ZK:** ZK-Email SDK + DKIM signature verification
- **Frontend:** Next.js 16 + TypeScript + Tailwind CSS
- **Wallet:** Phantom / Solflare via Solana Wallet Adapter
- **Email:** Gmail API (OAuth2, read-only)

---

## Local Development

```bash
# Start local validator + deploy + init state
./start-local.sh

# Or manually:
solana-test-validator --reset
cd contracts && anchor deploy
cd ../web && npm run dev
```

## Tests

```bash
# 168 Rust unit tests
cd contracts && cargo test

# 70 TypeScript integration tests
cd contracts && anchor test
```

---

## Treasury

Admin/Treasury wallet: `6uLKRRtbkCoNSk5k1YDUW8BwqAWQfYaSf3xJ79EiBxPt`

All employee reimbursements are paid from this wallet using live SOL/USD price conversion.
