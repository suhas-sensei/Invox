use anchor_lang::prelude::*;

declare_id!("9Zwa4Gps5uKjxEfUefLCa9ohf4aFzNgQuxRtA1fwvcLo");

const STATUS_PENDING: u8 = 0;
const STATUS_APPROVED: u8 = 1;
const STATUS_PAID: u8 = 2;
const STATUS_REJECTED: u8 = 3;
const STATUS_AUTO_APPROVED: u8 = 4;

#[program]
pub mod invoice_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, auto_approve_threshold: u64, monthly_cap: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.relayer = ctx.accounts.admin.key();
        state.invoice_count = 0;
        state.auto_approve_threshold = auto_approve_threshold;
        state.monthly_cap = monthly_cap;
        state.bump = ctx.bumps.state;
        Ok(())
    }

    pub fn submit_invoice(
        ctx: Context<SubmitInvoice>,
        invoice_hash: [u8; 32],
        vendor: String,
        amount_cents: u64,
        timestamp: i64,
        proof_verified: bool,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let invoice = &mut ctx.accounts.invoice;

        invoice.id = state.invoice_count;
        invoice.invoice_hash = invoice_hash;
        invoice.employee = ctx.accounts.employee.key();
        invoice.vendor = vendor;
        invoice.amount_cents = amount_cents;
        invoice.timestamp = timestamp;
        invoice.proof_verified = proof_verified;
        invoice.payment_tx = String::new();
        invoice.bump = ctx.bumps.invoice;

        if state.auto_approve_threshold > 0 && amount_cents <= state.auto_approve_threshold {
            invoice.status = STATUS_AUTO_APPROVED;
        } else {
            invoice.status = STATUS_PENDING;
        }

        state.invoice_count += 1;
        Ok(())
    }

    pub fn approve_invoice(ctx: Context<ModifyInvoice>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(invoice.status == STATUS_PENDING, InvoiceError::NotPending);
        invoice.status = STATUS_APPROVED;
        Ok(())
    }

    pub fn reject_invoice(ctx: Context<ModifyInvoice>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(invoice.status == STATUS_PENDING, InvoiceError::NotPending);
        invoice.status = STATUS_REJECTED;
        Ok(())
    }

    pub fn batch_approve(ctx: Context<ModifyInvoice>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        if invoice.status == STATUS_PENDING {
            invoice.status = STATUS_APPROVED;
        }
        Ok(())
    }

    pub fn mark_paid(ctx: Context<MarkPaid>, payment_tx: String) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(
            invoice.status == STATUS_APPROVED || invoice.status == STATUS_AUTO_APPROVED,
            InvoiceError::NotApproved
        );
        invoice.status = STATUS_PAID;
        invoice.payment_tx = payment_tx;
        Ok(())
    }

    pub fn set_auto_approve_threshold(ctx: Context<AdminOnly>, amount_cents: u64) -> Result<()> {
        ctx.accounts.state.auto_approve_threshold = amount_cents;
        Ok(())
    }

    pub fn set_monthly_cap(ctx: Context<AdminOnly>, amount_cents: u64) -> Result<()> {
        ctx.accounts.state.monthly_cap = amount_cents;
        Ok(())
    }
}

#[account]
pub struct RegistryState {
    pub admin: Pubkey,
    pub relayer: Pubkey,
    pub invoice_count: u64,
    pub auto_approve_threshold: u64,
    pub monthly_cap: u64,
    pub bump: u8,
}

#[account]
pub struct Invoice {
    pub id: u64,
    pub invoice_hash: [u8; 32],
    pub employee: Pubkey,
    pub vendor: String,
    pub amount_cents: u64,
    pub timestamp: i64,
    pub status: u8,
    pub proof_verified: bool,
    pub payment_tx: String,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 32 + 8 + 8 + 8 + 1, seeds = [b"state"], bump)]
    pub state: Account<'info, RegistryState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitInvoice<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, RegistryState>,
    #[account(init, payer = payer, space = 8 + 8 + 32 + 32 + 4 + 32 + 8 + 8 + 1 + 1 + 4 + 64 + 1, seeds = [b"invoice", state.invoice_count.to_le_bytes().as_ref()], bump)]
    pub invoice: Account<'info, Invoice>,
    /// CHECK: employee
    pub employee: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ModifyInvoice<'info> {
    #[account(seeds = [b"state"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, RegistryState>,
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct MarkPaid<'info> {
    #[account(seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, RegistryState>,
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, RegistryState>,
    pub admin: Signer<'info>,
}

#[error_code]
pub enum InvoiceError {
    #[msg("Invoice is not pending")]
    NotPending,
    #[msg("Invoice is not approved")]
    NotApproved,
    #[msg("Duplicate invoice")]
    Duplicate,
    #[msg("Monthly cap exceeded")]
    CapExceeded,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_status_constants() {
        assert_eq!(STATUS_PENDING, 0);
        assert_eq!(STATUS_APPROVED, 1);
        assert_eq!(STATUS_PAID, 2);
        assert_eq!(STATUS_REJECTED, 3);
        assert_eq!(STATUS_AUTO_APPROVED, 4);
    }
}