use anchor_lang::prelude::*;

declare_id!("BN6ry1pAjXhibJNS4h8Fseqi8KTge6dmkxTAnnoc71Ng");

#[program]
pub mod reimbursement_nft {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let s = &mut ctx.accounts.state;
        s.admin = ctx.accounts.admin.key();
        s.authorized_minter = Pubkey::default();
        s.total_supply = 0;
        s.bump = ctx.bumps.state;
        Ok(())
    }

    pub fn set_authorized_minter(ctx: Context<AdminOnly>, minter: Pubkey) -> Result<()> {
        ctx.accounts.state.authorized_minter = minter;
        Ok(())
    }

    /// CPI target: mint receipt NFT — callable by authorized minter or admin
    pub fn mint_receipt(
        ctx: Context<MintReceipt>,
        invoice_id: u64,
        vendor: String,
        amount_cents: u64,
        payment_tx: String,
        timestamp: i64,
    ) -> Result<()> {
        let s = &mut ctx.accounts.state;
        let r = &mut ctx.accounts.receipt;

        // Auth check: caller must be admin or authorized minter
        let caller = ctx.accounts.payer.key();
        require!(
            caller == s.admin || caller == s.authorized_minter,
            NftError::Unauthorized
        );

        r.token_id = s.total_supply;
        r.employee = ctx.accounts.employee.key();
        r.invoice_id = invoice_id;
        r.vendor = vendor;
        r.amount_cents = amount_cents;
        r.payment_tx = payment_tx;
        r.timestamp = timestamp;
        r.bump = ctx.bumps.receipt;

        s.total_supply += 1;
        Ok(())
    }
}

#[account]
pub struct NftState {
    pub admin: Pubkey,
    pub authorized_minter: Pubkey,
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
    #[account(init, payer = admin, space = 8 + 32 + 32 + 8 + 1, seeds = [b"nft-state"], bump)]
    pub state: Account<'info, NftState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"nft-state"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, NftState>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct MintReceipt<'info> {
    #[account(mut, seeds = [b"nft-state"], bump = state.bump)]
    pub state: Account<'info, NftState>,
    #[account(init, payer = payer, space = 8 + 8 + 32 + 8 + 4+32 + 8 + 4+64 + 8 + 1, seeds = [b"receipt", state.total_supply.to_le_bytes().as_ref()], bump)]
    pub receipt: Account<'info, Receipt>,
    /// CHECK: employee wallet
    pub employee: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum NftError {
    #[msg("Not authorized to mint")]
    Unauthorized,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_nft_state() { assert!(std::mem::size_of::<NftState>() > 0); }
}
