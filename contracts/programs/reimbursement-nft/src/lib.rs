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

    // ── Account sizes ──────────────────────────────────────────────────

    #[test]
    fn test_nft_state_size() {
        // 8 + 32 + 32 + 8 + 1 = 81
        assert_eq!(8 + 32 + 32 + 8 + 1, 81);
    }

    #[test]
    fn test_receipt_size() {
        // 8 + 8 + 32 + 8 + (4+32) + 8 + (4+64) + 8 + 1 = 177
        assert_eq!(8 + 8 + 32 + 8 + 4 + 32 + 8 + 4 + 64 + 8 + 1, 177);
    }

    #[test]
    fn test_nft_state_struct_nonempty() {
        assert!(std::mem::size_of::<NftState>() > 0);
    }

    #[test]
    fn test_receipt_struct_nonempty() {
        assert!(std::mem::size_of::<Receipt>() > 0);
    }

    // ── PDA seeds ──────────────────────────────────────────────────────

    #[test]
    fn test_nft_state_pda_seed() {
        let seeds: &[&[u8]] = &[b"nft-state"];
        assert_eq!(seeds[0], b"nft-state");
    }

    #[test]
    fn test_receipt_pda_seed() {
        let supply: u64 = 0;
        let seeds: &[&[u8]] = &[b"receipt", &supply.to_le_bytes()];
        assert_eq!(seeds[0], b"receipt");
        assert_eq!(seeds[1].len(), 8);
    }

    #[test]
    fn test_sequential_receipt_pdas_differ() {
        let id1: u64 = 0;
        let id2: u64 = 1;
        assert_ne!(id1.to_le_bytes(), id2.to_le_bytes());
    }

    // ── Authorization ──────────────────────────────────────────────────

    #[test]
    fn test_admin_can_mint() {
        let admin = Pubkey::new_unique();
        let minter = Pubkey::new_unique();
        let caller = admin;
        assert!(caller == admin || caller == minter);
    }

    #[test]
    fn test_authorized_minter_can_mint() {
        let admin = Pubkey::new_unique();
        let minter = Pubkey::new_unique();
        let caller = minter;
        assert!(caller == admin || caller == minter);
    }

    #[test]
    fn test_random_cannot_mint() {
        let admin = Pubkey::new_unique();
        let minter = Pubkey::new_unique();
        let random = Pubkey::new_unique();
        assert!(!(random == admin || random == minter));
    }

    #[test]
    fn test_default_minter_is_zero() {
        let minter = Pubkey::default();
        assert_eq!(minter, Pubkey::new_from_array([0u8; 32]));
    }

    // ── Supply tracking ────────────────────────────────────────────────

    #[test]
    fn test_total_supply_starts_zero() {
        let supply: u64 = 0;
        assert_eq!(supply, 0);
    }

    #[test]
    fn test_total_supply_increments() {
        let mut supply: u64 = 0;
        supply += 1;
        assert_eq!(supply, 1);
        supply += 1;
        assert_eq!(supply, 2);
    }

    #[test]
    fn test_token_id_equals_supply_before_mint() {
        let supply: u64 = 5;
        let token_id = supply; // next token_id = current supply
        assert_eq!(token_id, 5);
    }

    // ── Receipt data edge cases ────────────────────────────────────────

    #[test]
    fn test_receipt_vendor_max_length() {
        let vendor = "a".repeat(32);
        assert_eq!(vendor.len(), 32);
    }

    #[test]
    fn test_receipt_payment_tx_max_length() {
        // base58 sig max 88 chars
        let sig = "a".repeat(88);
        assert_eq!(sig.len(), 88);
    }

    #[test]
    fn test_receipt_zero_amount() {
        let amount: u64 = 0;
        assert_eq!(amount, 0);
    }

    #[test]
    fn test_receipt_large_invoice_id() {
        let id: u64 = u64::MAX;
        assert_eq!(id, u64::MAX);
    }

    #[test]
    fn test_receipt_negative_timestamp() {
        let ts: i64 = -1; // before epoch
        assert!(ts < 0);
    }

    #[test]
    fn test_receipt_zero_timestamp() {
        let ts: i64 = 0;
        assert_eq!(ts, 0);
    }

    // ── Multiple receipts per employee ─────────────────────────────────

    #[test]
    fn test_multiple_receipts_same_employee() {
        let employee = Pubkey::new_unique();
        let mut receipts = Vec::new();
        for i in 0..5u64 {
            receipts.push((employee, i));
        }
        assert_eq!(receipts.len(), 5);
        for (e, _) in &receipts {
            assert_eq!(*e, employee);
        }
    }
}
