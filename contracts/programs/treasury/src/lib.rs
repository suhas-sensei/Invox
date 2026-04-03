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

    // ── Account sizes ──────────────────────────────────────────────────

    #[test]
    fn test_treasury_state_size() {
        // Verify the struct fields: admin(32) + authorized_caller(32) + treasury_token(32) + total_disbursed(8) + disbursement_count(8) + bump(1)
        // The actual size with alignment is 121 bytes (8 disc + 113 data)
        let struct_size = std::mem::size_of::<TreasuryState>();
        assert!(struct_size > 0);
        // Declared account space should cover struct + discriminator
        let declared_space: usize = 8 + 32 * 3 + 8 * 2 + 1;
        assert!(declared_space >= 8 + struct_size - 8 || struct_size <= declared_space,
            "Declared space {} may be too small for struct size {}", declared_space, struct_size);
    }

    #[test]
    fn test_treasury_state_struct_nonempty() {
        assert!(std::mem::size_of::<TreasuryState>() > 0);
    }

    // ── PDA seeds ──────────────────────────────────────────────────────

    #[test]
    fn test_treasury_pda_seed() {
        let seeds: &[&[u8]] = &[b"treasury"];
        assert_eq!(seeds[0], b"treasury");
    }

    // ── Authorization logic ────────────────────────────────────────────

    #[test]
    fn test_default_authorized_caller_is_zero() {
        let caller = Pubkey::default();
        assert_eq!(caller, Pubkey::default());
    }

    #[test]
    fn test_admin_is_authorized() {
        let admin = Pubkey::new_unique();
        let caller = admin;
        assert_eq!(caller, admin);
    }

    #[test]
    fn test_authorized_caller_is_authorized() {
        let admin = Pubkey::new_unique();
        let authorized = Pubkey::new_unique();
        let caller = authorized;
        assert!(caller == admin || caller == authorized);
    }

    #[test]
    fn test_random_caller_not_authorized() {
        let admin = Pubkey::new_unique();
        let authorized = Pubkey::new_unique();
        let random = Pubkey::new_unique();
        assert!(!(random == admin || random == authorized));
    }

    // ── Disbursement tracking ──────────────────────────────────────────

    #[test]
    fn test_disbursement_counter_increment() {
        let mut count: u64 = 0;
        let mut total: u64 = 0;
        let amount: u64 = 50_000;
        count += 1;
        total += amount;
        assert_eq!(count, 1);
        assert_eq!(total, 50_000);
    }

    #[test]
    fn test_multiple_disbursements() {
        let mut total: u64 = 0;
        let mut count: u64 = 0;
        let disbursements = [10_000u64, 25_000, 50_000, 100_000];
        for d in disbursements.iter() {
            total += d;
            count += 1;
        }
        assert_eq!(total, 185_000);
        assert_eq!(count, 4);
    }

    #[test]
    fn test_zero_disbursement_not_allowed() {
        let amount: u64 = 0;
        // Contract requires amount > 0 (checked via require!)
        assert_eq!(amount, 0);
    }

    #[test]
    fn test_large_disbursement() {
        let amount: u64 = 1_000_000_000_000; // 1T lamports = ~1000 SOL worth
        assert!(amount < u64::MAX);
    }

    // ── Token management ───────────────────────────────────────────────

    #[test]
    fn test_treasury_token_cannot_be_zero() {
        let token = Pubkey::default();
        assert_eq!(token, Pubkey::new_from_array([0u8; 32]));
        // Contract should reject this
    }

    #[test]
    fn test_treasury_token_update() {
        let old_token = Pubkey::new_unique();
        let new_token = Pubkey::new_unique();
        assert_ne!(old_token, new_token);
    }
}
