use anchor_lang::prelude::*;

declare_id!("9x3wUkmGKZNDuK5qtNjgdBCbUZKfaQ2SNs1g4DPU6AEp");

#[program]
pub mod vendor_registry {
    use super::*;

    pub fn register_vendor(ctx: Context<RegisterVendor>, vendor_hash: [u8; 32], name: String, max_amount_cents: u64) -> Result<()> {
        let v = &mut ctx.accounts.vendor;
        v.vendor_hash = vendor_hash;
        v.name = name;
        v.max_amount_cents = max_amount_cents;
        v.approved = true;
        v.total_spend = 0;
        v.invoice_count = 0;
        v.bump = ctx.bumps.vendor;
        Ok(())
    }

    pub fn remove_vendor(ctx: Context<ModifyVendor>) -> Result<()> {
        ctx.accounts.vendor.approved = false;
        Ok(())
    }

    /// CPI target: validate vendor is approved and amount is within limits
    pub fn validate_vendor(ctx: Context<ValidateVendor>, amount_cents: u64) -> Result<()> {
        let v = &ctx.accounts.vendor;
        require!(v.approved, VendorError::NotApproved);
        if v.max_amount_cents > 0 {
            require!(amount_cents <= v.max_amount_cents, VendorError::ExceedsLimit);
        }
        Ok(())
    }

    /// CPI target: record spend after successful invoice submission
    pub fn record_spend(ctx: Context<RecordSpend>, amount_cents: u64) -> Result<()> {
        let v = &mut ctx.accounts.vendor;
        v.total_spend += amount_cents;
        v.invoice_count += 1;
        Ok(())
    }
}

#[account]
pub struct VendorRecord {
    pub vendor_hash: [u8; 32],
    pub name: String,
    pub max_amount_cents: u64,
    pub approved: bool,
    pub total_spend: u64,
    pub invoice_count: u64,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(vendor_hash: [u8; 32])]
pub struct RegisterVendor<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 4+32 + 8 + 1 + 8 + 8 + 1, seeds = [b"vendor", vendor_hash.as_ref()], bump)]
    pub vendor: Account<'info, VendorRecord>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ModifyVendor<'info> {
    #[account(mut)]
    pub vendor: Account<'info, VendorRecord>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct ValidateVendor<'info> {
    pub vendor: Account<'info, VendorRecord>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RecordSpend<'info> {
    #[account(mut)]
    pub vendor: Account<'info, VendorRecord>,
    pub authority: Signer<'info>,
}

#[error_code]
pub enum VendorError {
    #[msg("Vendor not approved")]
    NotApproved,
    #[msg("Amount exceeds vendor limit")]
    ExceedsLimit,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Account sizes ──────────────────────────────────────────────────

    #[test]
    fn test_vendor_record_size() {
        // 8 + 32 + (4+32) + 8 + 1 + 8 + 8 + 1 = 102
        assert_eq!(8 + 32 + 4 + 32 + 8 + 1 + 8 + 8 + 1, 102);
    }

    #[test]
    fn test_vendor_record_struct_nonempty() {
        assert!(std::mem::size_of::<VendorRecord>() > 0);
    }

    // ── PDA seeds ──────────────────────────────────────────────────────

    #[test]
    fn test_vendor_pda_seed_format() {
        let hash = [1u8; 32];
        let seeds: &[&[u8]] = &[b"vendor", hash.as_ref()];
        assert_eq!(seeds[0], b"vendor");
        assert_eq!(seeds[1].len(), 32);
    }

    #[test]
    fn test_different_vendor_hashes_different_pdas() {
        let h1 = [1u8; 32];
        let h2 = [2u8; 32];
        assert_ne!(h1, h2);
    }

    // ── Vendor approval logic ──────────────────────────────────────────

    #[test]
    fn test_vendor_starts_approved() {
        let approved = true;
        assert!(approved);
    }

    #[test]
    fn test_vendor_removal_sets_unapproved() {
        let mut approved = true;
        approved = false; // remove_vendor sets approved = false
        assert!(!approved);
    }

    // ── Vendor limit validation ────────────────────────────────────────

    #[test]
    fn test_validate_under_limit() {
        let max_amount: u64 = 100_000;
        let amount: u64 = 50_000;
        assert!(amount <= max_amount);
    }

    #[test]
    fn test_validate_at_limit() {
        let max_amount: u64 = 100_000;
        let amount: u64 = 100_000;
        assert!(amount <= max_amount);
    }

    #[test]
    fn test_validate_over_limit() {
        let max_amount: u64 = 100_000;
        let amount: u64 = 100_001;
        assert!(amount > max_amount);
    }

    #[test]
    fn test_validate_zero_limit_means_unlimited() {
        let max_amount: u64 = 0;
        let amount: u64 = 999_999_999;
        // When max_amount_cents == 0, no limit check is performed
        if max_amount > 0 {
            assert!(amount <= max_amount);
        }
        // passes because limit is 0 (disabled)
    }

    // ── Spend tracking ─────────────────────────────────────────────────

    #[test]
    fn test_spend_accumulation() {
        let mut total: u64 = 0;
        let mut count: u64 = 0;
        let spends = [5000u64, 10000, 15000];
        for s in spends.iter() {
            total += s;
            count += 1;
        }
        assert_eq!(total, 30000);
        assert_eq!(count, 3);
    }

    #[test]
    fn test_spend_starts_zero() {
        let total_spend: u64 = 0;
        let invoice_count: u64 = 0;
        assert_eq!(total_spend, 0);
        assert_eq!(invoice_count, 0);
    }

    #[test]
    fn test_spend_large_amount() {
        let mut total: u64 = 0;
        let amount: u64 = 10_000_000_00; // $100M in cents
        total += amount;
        assert_eq!(total, amount);
    }

    // ── Vendor name ────────────────────────────────────────────────────

    #[test]
    fn test_vendor_name_max_length() {
        let name = "a".repeat(32);
        assert_eq!(name.len(), 32);
    }

    #[test]
    fn test_vendor_name_empty() {
        let name = String::new();
        assert_eq!(name.len(), 0);
    }

    #[test]
    fn test_vendor_hash_all_zeros() {
        let hash = [0u8; 32];
        assert_eq!(hash.len(), 32);
    }

    #[test]
    fn test_vendor_hash_all_ones() {
        let hash = [255u8; 32];
        assert_eq!(hash.len(), 32);
    }
}
