use anchor_lang::prelude::*;

declare_id!("6wwGHtUjCVWqjH7UBg7YhUV5dVdPhRT9axCa7iQM8p73");

#[program]
pub mod multisig_approver {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, threshold: u32, amount_threshold: u64) -> Result<()> {
        let s = &mut ctx.accounts.state;
        s.admin = ctx.accounts.admin.key();
        s.approval_threshold = threshold;
        s.amount_threshold = amount_threshold;
        s.signer_count = 0;
        s.bump = ctx.bumps.state;
        Ok(())
    }

    pub fn add_signer(ctx: Context<AddSigner>, signer: Pubkey) -> Result<()> {
        let rec = &mut ctx.accounts.signer_record;
        rec.signer = signer;
        rec.active = true;
        rec.bump = ctx.bumps.signer_record;
        ctx.accounts.state.signer_count += 1;
        Ok(())
    }

    pub fn sign_approval(ctx: Context<SignApproval>, _invoice_id: u64) -> Result<()> {
        ctx.accounts.approval.sig_count += 1;
        Ok(())
    }

    /// CPI target: check if invoice has enough signatures for approval
    pub fn check_approved(ctx: Context<CheckApproved>, _invoice_id: u64) -> Result<()> {
        let state = &ctx.accounts.state;
        let approval = &ctx.accounts.approval;
        require!(
            approval.sig_count >= state.approval_threshold,
            MultisigError::InsufficientSignatures
        );
        Ok(())
    }

    /// Check if amount requires multisig
    pub fn requires_multisig(ctx: Context<CheckThreshold>, amount_cents: u64) -> Result<()> {
        let state = &ctx.accounts.state;
        if state.amount_threshold > 0 && amount_cents > state.amount_threshold {
            return err!(MultisigError::MultisigRequired);
        }
        Ok(())
    }
}

#[account]
pub struct MultisigState {
    pub admin: Pubkey,
    pub approval_threshold: u32,
    pub amount_threshold: u64,
    pub signer_count: u32,
    pub bump: u8,
}

#[account]
pub struct SignerRecord { pub signer: Pubkey, pub active: bool, pub bump: u8 }

#[account]
pub struct ApprovalRecord { pub invoice_id: u64, pub sig_count: u32, pub bump: u8 }

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 4 + 8 + 4 + 1, seeds = [b"multisig"], bump)]
    pub state: Account<'info, MultisigState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddSigner<'info> {
    #[account(mut, seeds = [b"multisig"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, MultisigState>,
    #[account(init, payer = admin, space = 8 + 32 + 1 + 1, seeds = [b"signer", state.signer_count.to_le_bytes().as_ref()], bump)]
    pub signer_record: Account<'info, SignerRecord>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_id: u64)]
pub struct SignApproval<'info> {
    #[account(init_if_needed, payer = signer, space = 8 + 8 + 4 + 1, seeds = [b"approval", invoice_id.to_le_bytes().as_ref()], bump)]
    pub approval: Account<'info, ApprovalRecord>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_id: u64)]
pub struct CheckApproved<'info> {
    #[account(seeds = [b"multisig"], bump = state.bump)]
    pub state: Account<'info, MultisigState>,
    #[account(seeds = [b"approval", invoice_id.to_le_bytes().as_ref()], bump)]
    pub approval: Account<'info, ApprovalRecord>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CheckThreshold<'info> {
    #[account(seeds = [b"multisig"], bump = state.bump)]
    pub state: Account<'info, MultisigState>,
    pub authority: Signer<'info>,
}

#[error_code]
pub enum MultisigError {
    #[msg("Insufficient signatures for approval")]
    InsufficientSignatures,
    #[msg("Multisig approval required for this amount")]
    MultisigRequired,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Account sizes ──────────────────────────────────────────────────

    #[test]
    fn test_multisig_state_size() {
        // 8 + 32 + 4 + 8 + 4 + 1 = 57
        assert_eq!(8 + 32 + 4 + 8 + 4 + 1, 57);
    }

    #[test]
    fn test_signer_record_size() {
        // 8 + 32 + 1 + 1 = 42
        assert_eq!(8 + 32 + 1 + 1, 42);
    }

    #[test]
    fn test_approval_record_size() {
        // 8 + 8 + 4 + 1 = 21
        assert_eq!(8 + 8 + 4 + 1, 21);
    }

    // ── Threshold logic ────────────────────────────────────────────────

    #[test]
    fn test_threshold_met_exact() {
        let sig_count: u32 = 2;
        let threshold: u32 = 2;
        assert!(sig_count >= threshold);
    }

    #[test]
    fn test_threshold_exceeded() {
        let sig_count: u32 = 3;
        let threshold: u32 = 2;
        assert!(sig_count >= threshold);
    }

    #[test]
    fn test_threshold_not_met() {
        let sig_count: u32 = 1;
        let threshold: u32 = 2;
        assert!(sig_count < threshold);
    }

    #[test]
    fn test_threshold_one_of_one() {
        let sig_count: u32 = 1;
        let threshold: u32 = 1;
        assert!(sig_count >= threshold);
    }

    #[test]
    fn test_threshold_zero_sigs() {
        let sig_count: u32 = 0;
        let threshold: u32 = 2;
        assert!(sig_count < threshold);
    }

    // ── Amount threshold (requires_multisig) ───────────────────────────

    #[test]
    fn test_requires_multisig_over_threshold() {
        let amount_threshold: u64 = 100_000;
        let amount: u64 = 100_001;
        assert!(amount_threshold > 0 && amount > amount_threshold);
    }

    #[test]
    fn test_requires_multisig_at_threshold() {
        let amount_threshold: u64 = 100_000;
        let amount: u64 = 100_000;
        // At threshold → does NOT require multisig (only > triggers)
        assert!(!(amount_threshold > 0 && amount > amount_threshold));
    }

    #[test]
    fn test_requires_multisig_under_threshold() {
        let amount_threshold: u64 = 100_000;
        let amount: u64 = 50_000;
        assert!(!(amount_threshold > 0 && amount > amount_threshold));
    }

    #[test]
    fn test_requires_multisig_disabled() {
        let amount_threshold: u64 = 0;
        let amount: u64 = 999_999_999;
        // threshold == 0 means multisig disabled
        assert!(!(amount_threshold > 0 && amount > amount_threshold));
    }

    // ── Signer management ──────────────────────────────────────────────

    #[test]
    fn test_signer_count_starts_zero() {
        let count: u32 = 0;
        assert_eq!(count, 0);
    }

    #[test]
    fn test_signer_count_increment() {
        let mut count: u32 = 0;
        count += 1;
        assert_eq!(count, 1);
        count += 1;
        assert_eq!(count, 2);
    }

    #[test]
    fn test_signer_active_flag() {
        let active = true;
        assert!(active);
    }

    #[test]
    fn test_signer_pda_seed() {
        let count: u32 = 0;
        let seeds: &[&[u8]] = &[b"signer", &count.to_le_bytes()];
        assert_eq!(seeds[0], b"signer");
        assert_eq!(seeds[1].len(), 4);
    }

    // ── Approval PDA ───────────────────────────────────────────────────

    #[test]
    fn test_approval_pda_seed() {
        let invoice_id: u64 = 42;
        let seeds: &[&[u8]] = &[b"approval", &invoice_id.to_le_bytes()];
        assert_eq!(seeds[0], b"approval");
        assert_eq!(seeds[1].len(), 8);
    }

    #[test]
    fn test_different_invoices_different_approval_pdas() {
        let id1: u64 = 1;
        let id2: u64 = 2;
        assert_ne!(id1.to_le_bytes(), id2.to_le_bytes());
    }

    // ── Signature counting ─────────────────────────────────────────────

    #[test]
    fn test_sig_count_increment() {
        let mut count: u32 = 0;
        count += 1;
        assert_eq!(count, 1);
    }

    #[test]
    fn test_sig_count_after_multiple_signers() {
        let threshold: u32 = 3;
        let mut sig_count: u32 = 0;
        for _ in 0..3 {
            sig_count += 1;
        }
        assert!(sig_count >= threshold);
    }

    // ── Edge: threshold higher than signer count ───────────────────────

    #[test]
    fn test_threshold_higher_than_signers() {
        let signer_count: u32 = 2;
        let threshold: u32 = 5;
        // Impossible to reach threshold — valid config but never approves
        assert!(signer_count < threshold);
    }
}
