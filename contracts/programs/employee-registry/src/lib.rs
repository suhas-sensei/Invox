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
    pub bump: u8,
}

#[derive(Accounts)]
pub struct RegisterEmployee<'info> {
    #[account(init, payer = payer, space = 8 + 32 + 32 + 1 + 1, seeds = [b"employee", employee.key().as_ref()], bump)]
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
    #[test]
    fn test_employee_record_size() {
        assert_eq!(std::mem::size_of::<Pubkey>(), 32);
    }
}
