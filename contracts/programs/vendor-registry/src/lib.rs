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
    #[test]
    fn test_vendor_hash() { assert_eq!([0u8; 32].len(), 32); }
}
