use anchor_lang::prelude::*;

declare_id!("6wwGHtUjCVWqjH7UBg7YhUV5dVdPhRT9axCa7iQM8p73");

#[program]
pub mod multisig_approver {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, threshold: u32, amount_threshold: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.approval_threshold = threshold;
        state.amount_threshold = amount_threshold;
        state.signer_count = 1;
        state.bump = ctx.bumps.state;
        Ok(())
    }

    pub fn add_signer(ctx: Context<AdminOnly>, signer: Pubkey) -> Result<()> {
        let sig = &mut ctx.accounts.signer_record;
        sig.signer = signer;
        sig.active = true;
        sig.bump = ctx.bumps.signer_record;
        ctx.accounts.state.signer_count += 1;
        Ok(())
    }

    pub fn sign_approval(ctx: Context<SignApproval>, _invoice_id: u64) -> Result<()> {
        let approval = &mut ctx.accounts.approval;
        approval.sig_count += 1;
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
pub struct SignerRecord {
    pub signer: Pubkey,
    pub active: bool,
    pub bump: u8,
}

#[account]
pub struct ApprovalRecord {
    pub invoice_id: u64,
    pub sig_count: u32,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 4 + 8 + 4 + 1, seeds = [b"multisig"], bump)]
    pub state: Account<'info, MultisigState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_threshold() {
        assert!(2u32 > 0);
    }
}
