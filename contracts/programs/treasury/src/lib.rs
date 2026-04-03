use anchor_lang::prelude::*;

declare_id!("5G17KZKSoRdMhzqGg95uHH8skPbppJZFmtSMEiMSnWwC");

#[program]
pub mod treasury {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, treasury_token: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.treasury_token = treasury_token;
        state.authorized_caller = Pubkey::default();
        state.total_disbursed = 0;
        state.disbursement_count = 0;
        state.bump = ctx.bumps.state;
        Ok(())
    }

    pub fn set_authorized_caller(ctx: Context<AdminOnly>, caller: Pubkey) -> Result<()> {
        ctx.accounts.state.authorized_caller = caller;
        Ok(())
    }

    pub fn disburse(ctx: Context<Disburse>, _employee: Pubkey, amount: u64, _token: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.total_disbursed += amount;
        state.disbursement_count += 1;
        Ok(())
    }

    pub fn set_treasury_token(ctx: Context<AdminOnly>, token: Pubkey) -> Result<()> {
        ctx.accounts.state.treasury_token = token;
        Ok(())
    }
}

#[account]
pub struct TreasuryState {
    pub admin: Pubkey,
    pub authorized_caller: Pubkey,
    pub treasury_token: Pubkey,
    pub total_disbursed: u64,
    pub disbursement_count: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 32 + 32 + 8 + 8 + 1, seeds = [b"treasury"], bump)]
    pub state: Account<'info, TreasuryState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"treasury"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, TreasuryState>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct Disburse<'info> {
    #[account(mut, seeds = [b"treasury"], bump = state.bump)]
    pub state: Account<'info, TreasuryState>,
    pub authority: Signer<'info>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_treasury_state_size() {
        assert!(std::mem::size_of::<TreasuryState>() > 0);
    }
}
