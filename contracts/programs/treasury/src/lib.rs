use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("5G17KZKSoRdMhzqGg95uHH8skPbppJZFmtSMEiMSnWwC");

#[program]
pub mod treasury {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, treasury_token: Pubkey) -> Result<()> {
        let s = &mut ctx.accounts.state;
        s.admin = ctx.accounts.admin.key();
        s.treasury_token = treasury_token;
        s.authorized_caller = Pubkey::default();
        s.total_disbursed = 0;
        s.disbursement_count = 0;
        s.bump = ctx.bumps.state;
        Ok(())
    }

    pub fn set_authorized_caller(ctx: Context<AdminOnly>, caller: Pubkey) -> Result<()> {
        ctx.accounts.state.authorized_caller = caller;
        Ok(())
    }

    /// CPI target: transfer SPL tokens from treasury to employee
    pub fn disburse(ctx: Context<Disburse>, amount: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;

        // PDA signer seeds for treasury authority
        let seeds = &[b"treasury".as_ref(), &[state.bump]];
        let signer_seeds = &[&seeds[..]];

        // SPL token transfer from treasury vault to employee
        let cpi_accounts = Transfer {
            from: ctx.accounts.treasury_vault.to_account_info(),
            to: ctx.accounts.employee_token_account.to_account_info(),
            authority: ctx.accounts.treasury_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;

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
    #[account(init, payer = admin, space = 8 + 32*3 + 8*2 + 1, seeds = [b"treasury"], bump)]
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
    /// CHECK: PDA authority for treasury vault
    #[account(seeds = [b"treasury"], bump = state.bump)]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub treasury_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub employee_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub authority: Signer<'info>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_treasury_state() { assert!(std::mem::size_of::<TreasuryState>() > 0); }
}
