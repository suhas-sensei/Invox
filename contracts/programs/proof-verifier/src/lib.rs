use anchor_lang::prelude::*;

declare_id!("JCPDvoeEH4Qt1DW1CrvjbXu4akrw6APKBGr6H73cmbgU");

#[program]
pub mod proof_verifier {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.total_proofs = 0;
        state.revoked_count = 0;
        state.bump = ctx.bumps.state;
        Ok(())
    }

    pub fn submit_proof(
        ctx: Context<SubmitProof>,
        invoice_hash: [u8; 32],
        dkim_domain_hash: [u8; 32],
        commitment_hash: [u8; 32],
        vendor: String,
        amount_cents: u64,
        timestamp: i64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
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

        state.total_proofs += 1;
        Ok(())
    }

    pub fn revoke_proof(ctx: Context<RevokeProof>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        ctx.accounts.proof.revoked = true;
        state.revoked_count += 1;
        Ok(())
    }
}

#[account]
pub struct VerifierState {
    pub admin: Pubkey,
    pub total_proofs: u64,
    pub revoked_count: u64,
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

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 8 + 8 + 1, seeds = [b"verifier"], bump)]
    pub state: Account<'info, VerifierState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_hash: [u8; 32])]
pub struct SubmitProof<'info> {
    #[account(mut, seeds = [b"verifier"], bump = state.bump)]
    pub state: Account<'info, VerifierState>,
    #[account(init, payer = payer, space = 8 + 32 + 32 + 32 + 4 + 32 + 8 + 8 + 1 + 1 + 1, seeds = [b"proof", invoice_hash.as_ref()], bump)]
    pub proof: Account<'info, ProofRecord>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeProof<'info> {
    #[account(mut, seeds = [b"verifier"], bump = state.bump, has_one = admin)]
    pub state: Account<'info, VerifierState>,
    #[account(mut)]
    pub proof: Account<'info, ProofRecord>,
    pub admin: Signer<'info>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_proof_hash_size() {
        let hash = [0u8; 32];
        assert_eq!(hash.len(), 32);
    }
}
