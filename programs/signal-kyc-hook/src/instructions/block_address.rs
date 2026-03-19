use anchor_lang::prelude::*;
use crate::state::{KycStatus, KycAdminConfig};
use crate::errors::KycHookError;

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct BlockAddress<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"kyc_admin"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ KycHookError::AdminOnly
    )]
    pub config: Account<'info, KycAdminConfig>,

    #[account(
        mut,
        seeds = [b"kyc", wallet.as_ref()],
        bump = kyc_status.bump
    )]
    pub kyc_status: Account<'info, KycStatus>,
}

pub fn handler(ctx: Context<BlockAddress>, _wallet: Pubkey) -> Result<()> {
    let kyc = &mut ctx.accounts.kyc_status;
    kyc.is_blocked = true;
    kyc.verified = false;

    msg!("Address blocked (AML): {}", kyc.wallet);

    Ok(())
}
