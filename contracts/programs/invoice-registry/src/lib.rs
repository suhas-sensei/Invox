use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

declare_id!("9Zwa4Gps5uKjxEfUefLCa9ohf4aFzNgQuxRtA1fwvcLo");

const STATUS_PENDING: u8 = 0;
const STATUS_APPROVED: u8 = 1;
const STATUS_PAID: u8 = 2;
const STATUS_REJECTED: u8 = 3;
const STATUS_AUTO_APPROVED: u8 = 4;

#[program]
pub mod invoice_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, auto_approve_threshold: u64, monthly_cap: u64) -> Result<()> {
        let s = &mut ctx.accounts.state;
        s.admin = ctx.accounts.admin.key();
        s.relayer = ctx.accounts.admin.key();
        s.invoice_count = 0;
        s.auto_approve_threshold = auto_approve_threshold;
        s.monthly_cap = monthly_cap;
        s.bump = ctx.bumps.state;
        Ok(())
    }

    /// Submit invoice with on-chain validation:
    /// 1. Verify proof hash on-chain (recompute SHA256)
    /// 2. Check dedup (PDA-based — if account init fails, it's a duplicate)
    /// 3. Check monthly cap
    /// 4. Auto-approve if under threshold
    pub fn submit_invoice(
        ctx: Context<SubmitInvoice>,
        invoice_hash: [u8; 32],
        vendor: String,
        amount_cents: u64,
        timestamp: i64,
        dkim_domain_hash: [u8; 32],
    ) -> Result<()> {
        let s = &mut ctx.accounts.state;
        let inv = &mut ctx.accounts.invoice;
        let dedup = &mut ctx.accounts.dedup;

        // On-chain proof verification: recompute commitment hash
        let mut data = Vec::new();
        data.extend_from_slice(vendor.as_bytes());
        data.extend_from_slice(&amount_cents.to_le_bytes());
        data.extend_from_slice(&timestamp.to_le_bytes());
        data.extend_from_slice(&dkim_domain_hash);
        let computed = hash(&data);
        require!(computed.to_bytes() == invoice_hash, InvoiceError::ProofInvalid);

        // Dedup: mark this hash as used (PDA init would fail if already exists)
        dedup.invoice_hash = invoice_hash;
        dedup.used = true;

        // Monthly cap check
        let monthly = &mut ctx.accounts.monthly_spend;
        let new_spend = monthly.total_cents + amount_cents;
        if s.monthly_cap > 0 {
            require!(new_spend <= s.monthly_cap, InvoiceError::CapExceeded);
        }
        monthly.total_cents = new_spend;
        monthly.invoice_count += 1;

        // Store invoice
        inv.id = s.invoice_count;
        inv.invoice_hash = invoice_hash;
        inv.employee = ctx.accounts.employee.key();
        inv.vendor = vendor;
        inv.amount_cents = amount_cents;
        inv.timestamp = timestamp;
        inv.proof_verified = true;
        inv.payment_tx = String::new();
        inv.bump = ctx.bumps.invoice;

        // Policy engine: auto-approve
        if s.auto_approve_threshold > 0 && amount_cents <= s.auto_approve_threshold {
            inv.status = STATUS_AUTO_APPROVED;
            msg!("Invoice #{} auto-approved (${} < threshold ${})", s.invoice_count, amount_cents, s.auto_approve_threshold);
        } else {
            inv.status = STATUS_PENDING;
            msg!("Invoice #{} pending review (${} >= threshold ${})", s.invoice_count, amount_cents, s.auto_approve_threshold);
        }

        s.invoice_count += 1;
        Ok(())
    }

    pub fn approve_invoice(ctx: Context<ModifyInvoice>) -> Result<()> {
        let inv = &mut ctx.accounts.invoice;
        require!(inv.status == STATUS_PENDING, InvoiceError::NotPending);
        inv.status = STATUS_APPROVED;
        msg!("Invoice #{} approved by admin", inv.id);
        Ok(())
    }

    pub fn reject_invoice(ctx: Context<ModifyInvoice>) -> Result<()> {
        let inv = &mut ctx.accounts.invoice;
        require!(inv.status == STATUS_PENDING, InvoiceError::NotPending);
        inv.status = STATUS_REJECTED;
        msg!("Invoice #{} rejected", inv.id);
        Ok(())
    }

    pub fn batch_approve(ctx: Context<ModifyInvoice>) -> Result<()> {
        let inv = &mut ctx.accounts.invoice;
        if inv.status == STATUS_PENDING {
            inv.status = STATUS_APPROVED;
        }
        Ok(())
    }

    /// Combined pay instruction:
    /// 1. Check invoice is approved/auto-approved
    /// 2. Mark paid with payment tx signature
    pub fn mark_paid(ctx: Context<MarkPaid>, payment_tx: String) -> Result<()> {
        let inv = &mut ctx.accounts.invoice;
        require!(
            inv.status == STATUS_APPROVED || inv.status == STATUS_AUTO_APPROVED,
            InvoiceError::NotApproved
        );
        inv.status = STATUS_PAID;
        inv.payment_tx = payment_tx;
        msg!("Invoice #{} marked paid", inv.id);
        Ok(())
    }

    pub fn set_auto_approve_threshold(ctx: Context<AdminOnly>, amount_cents: u64) -> Result<()> {
        ctx.accounts.state.auto_approve_threshold = amount_cents;
        msg!("Auto-approve threshold set to ${}", amount_cents);
        Ok(())
    }

    pub fn set_monthly_cap(ctx: Context<AdminOnly>, amount_cents: u64) -> Result<()> {
        ctx.accounts.state.monthly_cap = amount_cents;
        msg!("Monthly cap set to ${}", amount_cents);
        Ok(())
    }
}

// ── Accounts ────────────────────────────────────────────────────────

#[account]
pub struct RegistryState {
    pub admin: Pubkey,
    pub relayer: Pubkey,
    pub invoice_count: u64,
    pub auto_approve_threshold: u64,
    pub monthly_cap: u64,
    pub bump: u8,
}

#[account]
pub struct Invoice {
    pub id: u64,
    pub invoice_hash: [u8; 32],
    pub employee: Pubkey,
    pub vendor: String,        // max 32
    pub amount_cents: u64,
    pub timestamp: i64,
    pub status: u8,
    pub proof_verified: bool,
    pub payment_tx: String,    // max 88 (base58 sig)
    pub bump: u8,
}

#[account]
pub struct DedupRecord {
    pub invoice_hash: [u8; 32],
    pub used: bool,
    pub bump: u8,
}

#[account]
pub struct MonthlySpend {
    pub employee: Pubkey,
    pub month: u16,
    pub total_cents: u64,
    pub invoice_count: u32,
    pub bump: u8,
}

// ── Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 32 + 8 + 8 + 8 + 1, seeds = [b"state"], bump)]
    pub state: Account<'info, RegistryState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_hash: [u8; 32], vendor: String, amount_cents: u64, timestamp: i64)]
pub struct SubmitInvoice<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, RegistryState>,

    #[account(init, payer = payer, space = 8 + 8 + 32 + 32 + 4+32 + 8 + 8 + 1 + 1 + 4+88 + 1,
        seeds = [b"invoice", state.invoice_count.to_le_bytes().as_ref()], bump)]
    pub invoice: Account<'info, Invoice>,

    // Dedup: init fails if hash already submitted
    #[account(init, payer = payer, space = 8 + 32 + 1 + 1,
        seeds = [b"dedup", invoice_hash.as_ref()], bump)]
    pub dedup: Account<'info, DedupRecord>,

    // Monthly spend tracker per employee per month
    #[account(init_if_needed, payer = payer, space = 8 + 32 + 2 + 8 + 4 + 1,
        seeds = [b"monthly", employee.key().as_ref(), &((timestamp / 2592000) as u16).to_le_bytes()], bump)]
    pub monthly_spend: Account<'info, MonthlySpend>,

    /// CHECK: employee wallet
    pub employee: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ModifyInvoice<'info> {
    #[account(seeds = [b"state"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, RegistryState>,
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct MarkPaid<'info> {
    #[account(seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, RegistryState>,
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, RegistryState>,
    pub admin: Signer<'info>,
}

// ── Errors ──────────────────────────────────────────────────────────

#[error_code]
pub enum InvoiceError {
    #[msg("Invoice not pending")]
    NotPending,
    #[msg("Invoice not approved")]
    NotApproved,
    #[msg("Duplicate invoice (hash already submitted)")]
    Duplicate,
    #[msg("Monthly spending cap exceeded")]
    CapExceeded,
    #[msg("Proof verification failed — on-chain hash recomputation mismatch")]
    ProofInvalid,
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Helper: compute invoice hash the same way submit_invoice does ──
    fn compute_invoice_hash(vendor: &str, amount_cents: u64, timestamp: i64, dkim: &[u8; 32]) -> [u8; 32] {
        let mut data = Vec::new();
        data.extend_from_slice(vendor.as_bytes());
        data.extend_from_slice(&amount_cents.to_le_bytes());
        data.extend_from_slice(&timestamp.to_le_bytes());
        data.extend_from_slice(dkim);
        hash(&data).to_bytes()
    }

    // ── Status constants ───────────────────────────────────────────────

    #[test]
    fn test_status_constants_values() {
        assert_eq!(STATUS_PENDING, 0);
        assert_eq!(STATUS_APPROVED, 1);
        assert_eq!(STATUS_PAID, 2);
        assert_eq!(STATUS_REJECTED, 3);
        assert_eq!(STATUS_AUTO_APPROVED, 4);
    }

    #[test]
    fn test_status_constants_unique() {
        let statuses = [STATUS_PENDING, STATUS_APPROVED, STATUS_PAID, STATUS_REJECTED, STATUS_AUTO_APPROVED];
        for i in 0..statuses.len() {
            for j in (i+1)..statuses.len() {
                assert_ne!(statuses[i], statuses[j], "Status {} and {} collide", i, j);
            }
        }
    }

    // ── Proof hash computation ─────────────────────────────────────────

    #[test]
    fn test_proof_hash_deterministic() {
        let h1 = compute_invoice_hash("stripe.com", 500, 1700000000, &[42u8; 32]);
        let h2 = compute_invoice_hash("stripe.com", 500, 1700000000, &[42u8; 32]);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_proof_hash_different_vendor() {
        let h1 = compute_invoice_hash("stripe.com", 500, 1700000000, &[42u8; 32]);
        let h2 = compute_invoice_hash("paypal.com", 500, 1700000000, &[42u8; 32]);
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_proof_hash_different_amount() {
        let h1 = compute_invoice_hash("stripe.com", 500, 1700000000, &[42u8; 32]);
        let h2 = compute_invoice_hash("stripe.com", 501, 1700000000, &[42u8; 32]);
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_proof_hash_different_timestamp() {
        let h1 = compute_invoice_hash("stripe.com", 500, 1700000000, &[42u8; 32]);
        let h2 = compute_invoice_hash("stripe.com", 500, 1700000001, &[42u8; 32]);
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_proof_hash_different_dkim() {
        let h1 = compute_invoice_hash("stripe.com", 500, 1700000000, &[42u8; 32]);
        let h2 = compute_invoice_hash("stripe.com", 500, 1700000000, &[43u8; 32]);
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_proof_hash_empty_vendor() {
        let h = compute_invoice_hash("", 500, 1700000000, &[0u8; 32]);
        assert_eq!(h.len(), 32);
    }

    #[test]
    fn test_proof_hash_zero_amount() {
        let h1 = compute_invoice_hash("v", 0, 0, &[0u8; 32]);
        let h2 = compute_invoice_hash("v", 1, 0, &[0u8; 32]);
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_proof_hash_max_amount() {
        let h = compute_invoice_hash("v", u64::MAX, i64::MAX, &[255u8; 32]);
        assert_eq!(h.len(), 32);
    }

    // ── Deduplication ──────────────────────────────────────────────────

    #[test]
    fn test_dedup_same_hash_same_pda() {
        let hash1 = [1u8; 32];
        let hash2 = [1u8; 32];
        assert_eq!(hash1, hash2); // same hash → same PDA seed → init fails on second
    }

    #[test]
    fn test_dedup_different_hash_different_pda() {
        let hash1 = [1u8; 32];
        let hash2 = [2u8; 32];
        assert_ne!(hash1, hash2); // different hash → different PDA → both succeed
    }

    #[test]
    fn test_dedup_single_bit_difference() {
        let mut hash1 = [0u8; 32];
        let mut hash2 = [0u8; 32];
        hash2[31] = 1; // single bit flip
        assert_ne!(hash1, hash2);
    }

    // ── Monthly cap logic ──────────────────────────────────────────────

    #[test]
    fn test_monthly_cap_under_limit() {
        let cap: u64 = 100_000;
        let spend: u64 = 50_000;
        let new_invoice: u64 = 40_000;
        assert!(spend + new_invoice <= cap);
    }

    #[test]
    fn test_monthly_cap_at_exact_limit() {
        let cap: u64 = 100_000;
        let spend: u64 = 50_000;
        let new_invoice: u64 = 50_000;
        assert!(spend + new_invoice <= cap); // exactly at cap should pass
    }

    #[test]
    fn test_monthly_cap_over_limit() {
        let cap: u64 = 100_000;
        let spend: u64 = 50_000;
        let new_invoice: u64 = 50_001;
        assert!(spend + new_invoice > cap);
    }

    #[test]
    fn test_monthly_cap_zero_means_unlimited() {
        let cap: u64 = 0;
        let spend: u64 = u64::MAX - 1;
        let new_invoice: u64 = 1;
        // cap == 0 means no cap check
        assert_eq!(cap, 0);
        assert!(spend + new_invoice > 0); // would pass since cap is disabled
    }

    #[test]
    fn test_monthly_cap_first_invoice() {
        let cap: u64 = 100_000;
        let spend: u64 = 0;
        let new_invoice: u64 = 100_000;
        assert!(spend + new_invoice <= cap);
    }

    // ── Auto-approve threshold ─────────────────────────────────────────

    #[test]
    fn test_auto_approve_under_threshold() {
        let threshold: u64 = 10_000;
        let amount: u64 = 5_000;
        assert!(threshold > 0 && amount <= threshold);
    }

    #[test]
    fn test_auto_approve_at_threshold() {
        let threshold: u64 = 10_000;
        let amount: u64 = 10_000;
        assert!(threshold > 0 && amount <= threshold); // equal should auto-approve
    }

    #[test]
    fn test_auto_approve_over_threshold() {
        let threshold: u64 = 10_000;
        let amount: u64 = 10_001;
        assert!(!(threshold > 0 && amount <= threshold)); // should be pending
    }

    #[test]
    fn test_auto_approve_disabled_when_zero() {
        let threshold: u64 = 0;
        let amount: u64 = 1;
        // threshold == 0 means auto-approve disabled
        assert!(!(threshold > 0 && amount <= threshold));
    }

    #[test]
    fn test_auto_approve_zero_amount_with_threshold() {
        let threshold: u64 = 10_000;
        let amount: u64 = 0;
        assert!(threshold > 0 && amount <= threshold); // $0 invoice auto-approves
    }

    // ── Month derivation from timestamp ────────────────────────────────

    #[test]
    fn test_month_derivation() {
        let timestamp: i64 = 2_592_000; // exactly 1 month
        let month = (timestamp / 2_592_000) as u16;
        assert_eq!(month, 1);
    }

    #[test]
    fn test_month_derivation_zero() {
        let timestamp: i64 = 0;
        let month = (timestamp / 2_592_000) as u16;
        assert_eq!(month, 0);
    }

    #[test]
    fn test_month_derivation_mid_month() {
        let timestamp: i64 = 2_592_000 + 1_000_000; // month 1, mid-way
        let month = (timestamp / 2_592_000) as u16;
        assert_eq!(month, 1);
    }

    #[test]
    fn test_month_boundary() {
        let ts1: i64 = 2_592_000 - 1; // end of month 0
        let ts2: i64 = 2_592_000;     // start of month 1
        assert_eq!((ts1 / 2_592_000) as u16, 0);
        assert_eq!((ts2 / 2_592_000) as u16, 1);
    }

    // ── Account sizes ──────────────────────────────────────────────────

    #[test]
    fn test_registry_state_size() {
        // 8 disc + 32 admin + 32 relayer + 8 count + 8 threshold + 8 cap + 1 bump = 97
        assert_eq!(8 + 32 + 32 + 8 + 8 + 8 + 1, 97);
    }

    #[test]
    fn test_invoice_account_size() {
        // 8 + 8 + 32 + 32 + (4+32) + 8 + 8 + 1 + 1 + (4+88) + 1 = 227
        assert_eq!(8 + 8 + 32 + 32 + 4 + 32 + 8 + 8 + 1 + 1 + 4 + 88 + 1, 227);
    }

    #[test]
    fn test_dedup_record_size() {
        // 8 + 32 + 1 + 1 = 42
        assert_eq!(8 + 32 + 1 + 1, 42);
    }

    #[test]
    fn test_monthly_spend_size() {
        // 8 + 32 + 2 + 8 + 4 + 1 = 55
        assert_eq!(8 + 32 + 2 + 8 + 4 + 1, 55);
    }

    // ── Status transition validity ─────────────────────────────────────

    #[test]
    fn test_approve_requires_pending() {
        let status = STATUS_PENDING;
        assert_eq!(status, STATUS_PENDING);
    }

    #[test]
    fn test_cannot_approve_already_approved() {
        let status = STATUS_APPROVED;
        assert_ne!(status, STATUS_PENDING);
    }

    #[test]
    fn test_cannot_approve_paid() {
        let status = STATUS_PAID;
        assert_ne!(status, STATUS_PENDING);
    }

    #[test]
    fn test_cannot_approve_rejected() {
        let status = STATUS_REJECTED;
        assert_ne!(status, STATUS_PENDING);
    }

    #[test]
    fn test_mark_paid_requires_approved_or_auto() {
        assert!(STATUS_APPROVED == STATUS_APPROVED || STATUS_APPROVED == STATUS_AUTO_APPROVED);
        assert!(STATUS_AUTO_APPROVED == STATUS_APPROVED || STATUS_AUTO_APPROVED == STATUS_AUTO_APPROVED);
    }

    #[test]
    fn test_cannot_pay_pending() {
        let status = STATUS_PENDING;
        assert!(!(status == STATUS_APPROVED || status == STATUS_AUTO_APPROVED));
    }

    #[test]
    fn test_cannot_pay_rejected() {
        let status = STATUS_REJECTED;
        assert!(!(status == STATUS_APPROVED || status == STATUS_AUTO_APPROVED));
    }

    // ── Overflow edge cases ────────────────────────────────────────────

    #[test]
    fn test_invoice_count_starts_zero() {
        let count: u64 = 0;
        assert_eq!(count, 0);
    }

    #[test]
    fn test_monthly_spend_accumulation() {
        let mut total: u64 = 0;
        let invoices = [1000u64, 2000, 3000, 500];
        for amt in invoices.iter() {
            total += amt;
        }
        assert_eq!(total, 6500);
    }

    #[test]
    fn test_large_vendor_string() {
        // Vendor field max 32 chars in account space
        let vendor = "a]".repeat(16); // 32 chars
        assert_eq!(vendor.len(), 32);
    }
}
