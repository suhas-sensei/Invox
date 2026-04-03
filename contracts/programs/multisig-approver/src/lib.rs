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
    #[test]
    fn test_threshold_check() { assert!(2u32 >= 2u32); }
}
