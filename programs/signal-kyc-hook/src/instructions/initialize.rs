use anchor_lang::prelude::*;
use crate::state::KycAdminConfig;

#[derive(Accounts)]
pub struct InitializeKycAdmin<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + KycAdminConfig::INIT_SPACE,
        seeds = [b"kyc_admin"],
        bump
    )]
    pub config: Account<'info, KycAdminConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeKycAdmin>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.bump = ctx.bumps.config;

    msg!("KYC Admin initialized: {}", config.admin);

    Ok(())
}
