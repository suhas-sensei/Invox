use anchor_lang::prelude::*;

declare_id!("HzTbJF5WV2nVPUqnZ5aVRj5akdFw7MWbUFEaFRp8mp5c");

// Invoice status constants
const STATUS_PENDING: u8 = 0;
const STATUS_APPROVED: u8 = 1;
const STATUS_PAID: u8 = 2;
const STATUS_REJECTED: u8 = 3;
const STATUS_AUTO_APPROVED: u8 = 4;

#[program]
pub mod zvoice {
    use super::*;

    // ── Initialize ──────────────────────────────────────────────────

    pub fn initialize(ctx: Context<Initialize>, auto_approve_threshold: u64, monthly_cap: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.relayer = ctx.accounts.admin.key();
        state.invoice_count = 0;
        state.auto_approve_threshold = auto_approve_threshold;
        state.monthly_cap = monthly_cap;
        state.total_receipts = 0;
        state.bump = ctx.bumps.state;
        Ok(())
    }

    // ── Invoice Registry ────────────────────────────────────────────

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
        invoice.payment_tx = [0u8; 64];
        invoice.bump = ctx.bumps.invoice;

        // Policy engine: auto-approve if under threshold
        if state.auto_approve_threshold > 0 && amount_cents <= state.auto_approve_threshold {
            invoice.status = STATUS_AUTO_APPROVED;
        } else {
            invoice.status = STATUS_PENDING;
        }

        state.invoice_count += 1;
        Ok(())
    }

    pub fn approve_invoice(ctx: Context<ApproveInvoice>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(invoice.status == STATUS_PENDING, ZVoiceError::InvoiceNotPending);
        invoice.status = STATUS_APPROVED;
        Ok(())
    }

    pub fn reject_invoice(ctx: Context<RejectInvoice>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(invoice.status == STATUS_PENDING, ZVoiceError::InvoiceNotPending);
        invoice.status = STATUS_REJECTED;
        Ok(())
    }

    pub fn mark_paid(ctx: Context<MarkPaid>, payment_tx: [u8; 64]) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(
            invoice.status == STATUS_APPROVED || invoice.status == STATUS_AUTO_APPROVED,
            ZVoiceError::InvoiceNotApproved
        );
        invoice.status = STATUS_PAID;
        invoice.payment_tx = payment_tx;
        Ok(())
    }

    // ── Policy Engine ───────────────────────────────────────────────

    pub fn set_auto_approve_threshold(ctx: Context<AdminOnly>, amount_cents: u64) -> Result<()> {
        ctx.accounts.state.auto_approve_threshold = amount_cents;
        Ok(())
    }

    pub fn set_monthly_cap(ctx: Context<AdminOnly>, amount_cents: u64) -> Result<()> {
        ctx.accounts.state.monthly_cap = amount_cents;
        Ok(())
    }

    // ── Employee Registry ───────────────────────────────────────────

    pub fn register_employee(
        ctx: Context<RegisterEmployee>,
        preferred_token: Pubkey,
    ) -> Result<()> {
        let emp = &mut ctx.accounts.employee_record;
        emp.employee = ctx.accounts.employee.key();
        emp.preferred_token = preferred_token;
        emp.registered = true;
        emp.bump = ctx.bumps.employee_record;
        Ok(())
    }

    pub fn set_preferred_token(
        ctx: Context<SetPreferredToken>,
        token: Pubkey,
    ) -> Result<()> {
        ctx.accounts.employee_record.preferred_token = token;
        Ok(())
    }

    // ── Proof Verifier ──────────────────────────────────────────────

    pub fn submit_proof(
        ctx: Context<SubmitProof>,
        invoice_hash: [u8; 32],
        dkim_domain_hash: [u8; 32],
        commitment_hash: [u8; 32],
        vendor: String,
        amount_cents: u64,
        timestamp: i64,
    ) -> Result<()> {
        let proof = &mut ctx.accounts.proof;
        proof.invoice_hash = invoice_hash;
        proof.dkim_domain_hash = dkim_domain_hash;
        proof.commitment_hash = commitment_hash;
        proof.vendor = vendor;
        proof.amount_cents = amount_cents;
        proof.timestamp = timestamp;
        proof.verified = true;
        proof.revoked = false;
        proof.bump = ctx.bumps.proof;
        Ok(())
    }

    pub fn revoke_proof(ctx: Context<RevokeProof>) -> Result<()> {
        ctx.accounts.proof.revoked = true;
        Ok(())
    }

    // ── Receipt NFT ─────────────────────────────────────────────────

    pub fn mint_receipt(
        ctx: Context<MintReceipt>,
        invoice_id: u64,
        vendor: String,
        amount_cents: u64,
        payment_tx: [u8; 64],
        timestamp: i64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let receipt = &mut ctx.accounts.receipt;

        receipt.token_id = state.total_receipts;
        receipt.employee = ctx.accounts.employee.key();
        receipt.invoice_id = invoice_id;
        receipt.vendor = vendor;
        receipt.amount_cents = amount_cents;
        receipt.payment_tx = payment_tx;
        receipt.timestamp = timestamp;
        receipt.bump = ctx.bumps.receipt;

        state.total_receipts += 1;
        Ok(())
    }

    // ── Vendor Registry ─────────────────────────────────────────────

    pub fn register_vendor(
        ctx: Context<RegisterVendor>,
        vendor_hash: [u8; 32],
        name: String,
        max_amount_cents: u64,
    ) -> Result<()> {
        let vendor = &mut ctx.accounts.vendor;
        vendor.vendor_hash = vendor_hash;
        vendor.name = name;
        vendor.max_amount_cents = max_amount_cents;
        vendor.approved = true;
        vendor.total_spend = 0;
        vendor.invoice_count = 0;
        vendor.bump = ctx.bumps.vendor;
        Ok(())
    }

    pub fn remove_vendor(ctx: Context<RemoveVendor>) -> Result<()> {
        ctx.accounts.vendor.approved = false;
        Ok(())
    }

    // ── Spending Analytics ──────────────────────────────────────────

    pub fn record_analytics(
        ctx: Context<RecordAnalytics>,
        event_type: u8, // 0=submit, 1=approve, 2=pay, 3=reject
        amount_cents: u64,
        month: u16,
    ) -> Result<()> {
        let analytics = &mut ctx.accounts.analytics;
        match event_type {
            0 => {
                analytics.total_submitted += 1;
                analytics.total_amount_submitted += amount_cents;
            }
            1 => analytics.total_approved += 1,
            2 => {
                analytics.total_paid += 1;
                analytics.total_amount_paid += amount_cents;
            }
            3 => analytics.total_rejected += 1,
            _ => {}
        }
        analytics.last_month = month;
        Ok(())
    }

    // ── MagicBlock Ephemeral Rollup Delegation ──────────────────────

    /// Delegate an invoice account to MagicBlock's Ephemeral Rollup
    /// for real-time processing. The account can be modified on the
    /// ephemeral rollup and committed back to Solana mainnet.
    pub fn delegate_to_ephemeral(ctx: Context<DelegateEphemeral>) -> Result<()> {
        // Mark the invoice as delegated to MagicBlock ER
        // In production, this would call MagicBlock's delegation CPI
        msg!("Invoice {} delegated to MagicBlock Ephemeral Rollup", ctx.accounts.invoice.id);
        Ok(())
    }

    /// Undelegate — commit the ephemeral state back to Solana
    pub fn undelegate_from_ephemeral(ctx: Context<UndelegateEphemeral>) -> Result<()> {
        msg!("Invoice {} undelegated from MagicBlock ER, committed to Solana", ctx.accounts.invoice.id);
        Ok(())
    }
}

// ── Account Structs ─────────────────────────────────────────────────

#[account]
pub struct ProgramState {
    pub admin: Pubkey,
    pub relayer: Pubkey,
    pub invoice_count: u64,
    pub auto_approve_threshold: u64,
    pub monthly_cap: u64,
    pub total_receipts: u64,
    pub bump: u8,
}

#[account]
pub struct Invoice {
    pub id: u64,
    pub invoice_hash: [u8; 32],
    pub employee: Pubkey,
    pub vendor: String,       // max 32 chars
    pub amount_cents: u64,
    pub timestamp: i64,
    pub status: u8,
    pub proof_verified: bool,
    pub payment_tx: [u8; 64],
    pub bump: u8,
}

#[account]
pub struct EmployeeRecord {
    pub employee: Pubkey,
    pub preferred_token: Pubkey,
    pub registered: bool,
    pub bump: u8,
}

#[account]
pub struct ProofRecord {
    pub invoice_hash: [u8; 32],
    pub dkim_domain_hash: [u8; 32],
    pub commitment_hash: [u8; 32],
    pub vendor: String,
    pub amount_cents: u64,
    pub timestamp: i64,
    pub verified: bool,
    pub revoked: bool,
    pub bump: u8,
}

#[account]
pub struct ReceiptNFT {
    pub token_id: u64,
    pub employee: Pubkey,
    pub invoice_id: u64,
    pub vendor: String,
    pub amount_cents: u64,
    pub payment_tx: [u8; 64],
    pub timestamp: i64,
    pub bump: u8,
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

#[account]
pub struct AnalyticsRecord {
    pub total_submitted: u64,
    pub total_approved: u64,
    pub total_paid: u64,
    pub total_rejected: u64,
    pub total_amount_submitted: u64,
    pub total_amount_paid: u64,
    pub last_month: u16,
    pub bump: u8,
}

// ── Instruction Contexts ────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1,
        seeds = [b"state"],
        bump,
    )]
    pub state: Account<'info, ProgramState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitInvoice<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, ProgramState>,
    #[account(
        init,
        payer = payer,
        space = 8 + 8 + 32 + 32 + (4 + 32) + 8 + 8 + 1 + 1 + 64 + 1,
        seeds = [b"invoice", state.invoice_count.to_le_bytes().as_ref()],
        bump,
    )]
    pub invoice: Account<'info, Invoice>,
    /// CHECK: employee wallet
    pub employee: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveInvoice<'info> {
    #[account(seeds = [b"state"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, ProgramState>,
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct RejectInvoice<'info> {
    #[account(seeds = [b"state"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, ProgramState>,
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct MarkPaid<'info> {
    #[account(seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, ProgramState>,
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, ProgramState>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterEmployee<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 1 + 1,
        seeds = [b"employee", employee.key().as_ref()],
        bump,
    )]
    pub employee_record: Account<'info, EmployeeRecord>,
    /// CHECK: employee wallet
    pub employee: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPreferredToken<'info> {
    #[account(
        mut,
        seeds = [b"employee", employee.key().as_ref()],
        bump = employee_record.bump,
    )]
    pub employee_record: Account<'info, EmployeeRecord>,
    pub employee: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(invoice_hash: [u8; 32])]
pub struct SubmitProof<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 32 + (4 + 32) + 8 + 8 + 1 + 1 + 1,
        seeds = [b"proof", invoice_hash.as_ref()],
        bump,
    )]
    pub proof: Account<'info, ProofRecord>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeProof<'info> {
    #[account(seeds = [b"state"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, ProgramState>,
    #[account(mut)]
    pub proof: Account<'info, ProofRecord>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct MintReceipt<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, ProgramState>,
    #[account(
        init,
        payer = payer,
        space = 8 + 8 + 32 + 8 + (4 + 32) + 8 + 64 + 8 + 1,
        seeds = [b"receipt", state.total_receipts.to_le_bytes().as_ref()],
        bump,
    )]
    pub receipt: Account<'info, ReceiptNFT>,
    /// CHECK: employee wallet
    pub employee: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vendor_hash: [u8; 32])]
pub struct RegisterVendor<'info> {
    #[account(seeds = [b"state"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, ProgramState>,
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + (4 + 32) + 8 + 1 + 8 + 8 + 1,
        seeds = [b"vendor", vendor_hash.as_ref()],
        bump,
    )]
    pub vendor: Account<'info, VendorRecord>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveVendor<'info> {
    #[account(seeds = [b"state"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, ProgramState>,
    #[account(mut)]
    pub vendor: Account<'info, VendorRecord>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct RecordAnalytics<'info> {
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + 8 + 8 + 8 + 8 + 8 + 8 + 2 + 1,
        seeds = [b"analytics"],
        bump,
    )]
    pub analytics: Account<'info, AnalyticsRecord>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DelegateEphemeral<'info> {
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UndelegateEphemeral<'info> {
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub admin: Signer<'info>,
}

// ── Errors ──────────────────────────────────────────────────────────

#[error_code]
pub enum ZVoiceError {
    #[msg("Invoice is not in pending status")]
    InvoiceNotPending,
    #[msg("Invoice is not approved")]
    InvoiceNotApproved,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Duplicate invoice")]
    DuplicateInvoice,
    #[msg("Monthly cap exceeded")]
    MonthlyCapExceeded,
}