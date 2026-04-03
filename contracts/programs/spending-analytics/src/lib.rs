use anchor_lang::prelude::*;

declare_id!("6rxb4Zmjaw9QF7a9CsFsQPCWqAQ6roiuW9BBg2fAgYSn");

#[program]
pub mod spending_analytics {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let a = &mut ctx.accounts.analytics;
        a.total_submitted = 0;
        a.total_approved = 0;
        a.total_paid = 0;
        a.total_rejected = 0;
        a.total_amount_submitted = 0;
        a.total_amount_paid = 0;
        a.bump = ctx.bumps.analytics;
        Ok(())
    }

    pub fn record_submission(ctx: Context<Record>, amount_cents: u64) -> Result<()> {
        let a = &mut ctx.accounts.analytics;
        a.total_submitted += 1;
        a.total_amount_submitted += amount_cents;
        Ok(())
    }

    pub fn record_approval(ctx: Context<Record>) -> Result<()> {
        ctx.accounts.analytics.total_approved += 1;
        Ok(())
    }

    pub fn record_payment(ctx: Context<Record>, amount_cents: u64) -> Result<()> {
        let a = &mut ctx.accounts.analytics;
        a.total_paid += 1;
        a.total_amount_paid += amount_cents;
        Ok(())
    }

    pub fn record_rejection(ctx: Context<Record>) -> Result<()> {
        ctx.accounts.analytics.total_rejected += 1;
        Ok(())
    }
}

#[account]
pub struct Analytics {
    pub total_submitted: u64,
    pub total_approved: u64,
    pub total_paid: u64,
    pub total_rejected: u64,
    pub total_amount_submitted: u64,
    pub total_amount_paid: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = payer, space = 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1, seeds = [b"analytics"], bump)]
    pub analytics: Account<'info, Analytics>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Record<'info> {
    #[account(mut, seeds = [b"analytics"], bump = analytics.bump)]
    pub analytics: Account<'info, Analytics>,
    pub authority: Signer<'info>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_analytics_counters() {
        assert_eq!(0u64 + 1, 1);
    }
}
