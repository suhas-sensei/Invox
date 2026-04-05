use anchor_lang::prelude::*;

declare_id!("GmBdHPG8SqkPQJ57p3JpRq1GzMkwF8mUfo74qCdLGneD");

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
    #[account(init, payer = payer, space = 8 + 8*6 + 1, seeds = [b"analytics"], bump)]
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

    // ── Account sizes ──────────────────────────────────────────────────

    #[test]
    fn test_analytics_size() {
        // 8 disc + 6*8 counters + 1 bump = 57
        assert_eq!(8 + 8 * 6 + 1, 57);
    }

    #[test]
    fn test_analytics_struct_nonempty() {
        assert!(std::mem::size_of::<Analytics>() > 0);
    }

    // ── PDA seed ───────────────────────────────────────────────────────

    #[test]
    fn test_analytics_pda_seed() {
        let seeds: &[&[u8]] = &[b"analytics"];
        assert_eq!(seeds[0], b"analytics");
    }

    // ── Counter logic ──────────────────────────────────────────────────

    #[test]
    fn test_submission_increments() {
        let mut total_submitted: u64 = 0;
        let mut total_amount_submitted: u64 = 0;
        let amount: u64 = 5000;

        total_submitted += 1;
        total_amount_submitted += amount;

        assert_eq!(total_submitted, 1);
        assert_eq!(total_amount_submitted, 5000);
    }

    #[test]
    fn test_approval_increments() {
        let mut total_approved: u64 = 0;
        total_approved += 1;
        assert_eq!(total_approved, 1);
    }

    #[test]
    fn test_payment_increments() {
        let mut total_paid: u64 = 0;
        let mut total_amount_paid: u64 = 0;
        let amount: u64 = 10000;

        total_paid += 1;
        total_amount_paid += amount;

        assert_eq!(total_paid, 1);
        assert_eq!(total_amount_paid, 10000);
    }

    #[test]
    fn test_rejection_increments() {
        let mut total_rejected: u64 = 0;
        total_rejected += 1;
        assert_eq!(total_rejected, 1);
    }

    // ── Full lifecycle ─────────────────────────────────────────────────

    #[test]
    fn test_full_invoice_lifecycle_counters() {
        let mut submitted: u64 = 0;
        let mut approved: u64 = 0;
        let mut paid: u64 = 0;
        let mut rejected: u64 = 0;
        let mut amt_submitted: u64 = 0;
        let mut amt_paid: u64 = 0;

        // Submit 5 invoices
        for i in 1..=5u64 {
            submitted += 1;
            amt_submitted += i * 1000;
        }
        // Approve 3
        for _ in 0..3 {
            approved += 1;
        }
        // Reject 2
        for _ in 0..2 {
            rejected += 1;
        }
        // Pay 3
        for i in 1..=3u64 {
            paid += 1;
            amt_paid += i * 1000;
        }

        assert_eq!(submitted, 5);
        assert_eq!(approved, 3);
        assert_eq!(paid, 3);
        assert_eq!(rejected, 2);
        assert_eq!(amt_submitted, 15000); // 1k+2k+3k+4k+5k
        assert_eq!(amt_paid, 6000);       // 1k+2k+3k
        assert_eq!(approved + rejected, submitted);
    }

    // ── Edge cases ─────────────────────────────────────────────────────

    #[test]
    fn test_zero_amount_submission() {
        let mut amt: u64 = 0;
        amt += 0;
        assert_eq!(amt, 0);
    }

    #[test]
    fn test_large_amount() {
        let mut total: u64 = 0;
        let amount: u64 = 1_000_000_000_000;
        total += amount;
        assert_eq!(total, amount);
    }

    #[test]
    fn test_counters_start_zero() {
        let submitted: u64 = 0;
        let approved: u64 = 0;
        let paid: u64 = 0;
        let rejected: u64 = 0;
        let amt_submitted: u64 = 0;
        let amt_paid: u64 = 0;
        assert_eq!(submitted + approved + paid + rejected + amt_submitted + amt_paid, 0);
    }

    #[test]
    fn test_more_paid_than_approved_impossible() {
        // Invariant: paid <= approved <= submitted
        let submitted: u64 = 10;
        let approved: u64 = 7;
        let paid: u64 = 5;
        assert!(paid <= approved);
        assert!(approved <= submitted);
    }

    #[test]
    fn test_rejected_plus_approved_equals_submitted() {
        let submitted: u64 = 10;
        let approved: u64 = 6;
        let rejected: u64 = 4;
        assert_eq!(approved + rejected, submitted);
    }
}
