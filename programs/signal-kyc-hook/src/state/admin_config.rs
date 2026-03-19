use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct KycAdminConfig {
    /// The admin authority for KYC operations
    pub admin: Pubkey,
    /// PDA bump
    pub bump: u8,
}
