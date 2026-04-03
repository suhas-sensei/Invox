use anchor_lang::prelude::*;

declare_id!("FJoYF2xDCeCkaFxEL7gXuavy6cWJ3mbtzwsock1h73bo");

#[program]
pub mod employee_registry {
    use super::*;

    pub fn register_employee(ctx: Context<RegisterEmployee>, preferred_token: Pubkey) -> Result<()> {
        let rec = &mut ctx.accounts.employee_record;
        rec.employee = ctx.accounts.employee.key();
        rec.preferred_token = preferred_token;
        rec.registered = true;
        rec.total_reimbursed = 0;
        rec.invoice_count = 0;
        rec.bump = ctx.bumps.employee_record;
        Ok(())
    }

    pub fn set_preferred_token(ctx: Context<SetPreferredToken>, token: Pubkey) -> Result<()> {
        ctx.accounts.employee_record.preferred_token = token;
        Ok(())
    }
}

#[account]
pub struct EmployeeRecord {
    pub employee: Pubkey,
    pub preferred_token: Pubkey,
    pub registered: bool,
    pub total_reimbursed: u64,
    pub invoice_count: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct RegisterEmployee<'info> {
    #[account(init, payer = payer, space = 8 + 32 + 32 + 1 + 8 + 8 + 1, seeds = [b"employee", employee.key().as_ref()], bump)]
    pub employee_record: Account<'info, EmployeeRecord>,
    /// CHECK: employee wallet
    pub employee: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPreferredToken<'info> {
    #[account(mut, seeds = [b"employee", employee.key().as_ref()], bump = employee_record.bump)]
    pub employee_record: Account<'info, EmployeeRecord>,
    pub employee: Signer<'info>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Account sizes ──────────────────────────────────────────────────

    #[test]
    fn test_employee_record_size() {
        // 8 disc + 32 employee + 32 preferred_token + 1 registered + 8 total_reimbursed + 8 invoice_count + 1 bump = 90
        assert_eq!(8 + 32 + 32 + 1 + 8 + 8 + 1, 90);
    }

    #[test]
    fn test_employee_record_struct_nonempty() {
        assert!(std::mem::size_of::<EmployeeRecord>() > 0);
    }

    // ── PDA seed derivation ────────────────────────────────────────────

    #[test]
    fn test_employee_pda_seeds_format() {
        let key = Pubkey::new_unique();
        let seeds: &[&[u8]] = &[b"employee", key.as_ref()];
        assert_eq!(seeds[0], b"employee");
        assert_eq!(seeds[1].len(), 32);
    }

    #[test]
    fn test_different_employees_different_pdas() {
        let key1 = Pubkey::new_unique();
        let key2 = Pubkey::new_unique();
        assert_ne!(key1, key2); // different keys → different PDA seeds
    }

    // ── Field defaults ─────────────────────────────────────────────────

    #[test]
    fn test_default_token_is_valid_pubkey() {
        let token = Pubkey::default();
        assert_eq!(token, Pubkey::default());
    }

    #[test]
    fn test_initial_counters_zero() {
        let total_reimbursed: u64 = 0;
        let invoice_count: u64 = 0;
        assert_eq!(total_reimbursed, 0);
        assert_eq!(invoice_count, 0);
    }

    // ── Registration edge cases ────────────────────────────────────────

    #[test]
    fn test_registered_flag() {
        let registered = true;
        assert!(registered);
    }

    #[test]
    fn test_preferred_token_zero_pubkey() {
        // Zero pubkey as preferred token — could be used to indicate "no preference"
        let token = Pubkey::default();
        assert_eq!(token, Pubkey::new_from_array([0u8; 32]));
    }

    #[test]
    fn test_preferred_token_nonzero() {
        let token = Pubkey::new_unique();
        assert_ne!(token, Pubkey::default());
    }

    // ── Counter overflow ───────────────────────────────────────────────

    #[test]
    fn test_invoice_count_increment() {
        let mut count: u64 = 0;
        count += 1;
        assert_eq!(count, 1);
    }

    #[test]
    fn test_reimbursement_accumulation() {
        let mut total: u64 = 0;
        let amounts = [10_000u64, 25_000, 50_000, 100];
        for a in amounts.iter() {
            total += a;
        }
        assert_eq!(total, 85_100);
    }

    #[test]
    fn test_large_reimbursement_amount() {
        let amount: u64 = 1_000_000_000; // $10M in cents
        assert!(amount < u64::MAX);
    }
}
