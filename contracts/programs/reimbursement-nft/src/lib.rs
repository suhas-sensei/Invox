use anchor_lang::prelude::*;

declare_id!("BN6ry1pAjXhibJNS4h8Fseqi8KTge6dmkxTAnnoc71Ng");

#[program]
pub mod reimbursement_nft {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.total_supply = 0;
        state.bump = ctx.bumps.state;
        Ok(())
    }

    pub fn mint_receipt(
        ctx: Context<MintReceipt>,
        invoice_id: u64,
        vendor: String,
        amount_cents: u64,
        payment_tx: String,
        timestamp: i64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let receipt = &mut ctx.accounts.receipt;

        receipt.token_id = state.total_supply;
        receipt.employee = ctx.accounts.employee.key();
        receipt.invoice_id = invoice_id;
        receipt.vendor = vendor;
        receipt.amount_cents = amount_cents;
        receipt.payment_tx = payment_tx;
        receipt.timestamp = timestamp;
        receipt.bump = ctx.bumps.receipt;

        state.total_supply += 1;
        Ok(())
    }
}

#[account]
pub struct NftState {
    pub admin: Pubkey,
    pub total_supply: u64,
    pub bump: u8,
}

#[account]
pub struct Receipt {
    pub token_id: u64,
    pub employee: Pubkey,
    pub invoice_id: u64,
    pub vendor: String,
    pub amount_cents: u64,
    pub payment_tx: String,
    pub timestamp: i64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 8 + 1, seeds = [b"nft-state"], bump)]
    pub state: Account<'info, NftState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintReceipt<'info> {
    #[account(mut, seeds = [b"nft-state"], bump = state.bump)]
    pub state: Account<'info, NftState>,
    #[account(init, payer = payer, space = 8 + 8 + 32 + 8 + 4 + 32 + 8 + 4 + 64 + 8 + 1, seeds = [b"receipt", state.total_supply.to_le_bytes().as_ref()], bump)]
    pub receipt: Account<'info, Receipt>,
    /// CHECK: employee
    pub employee: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_nft_state() {
        assert!(std::mem::size_of::<NftState>() > 0);
    }
}
