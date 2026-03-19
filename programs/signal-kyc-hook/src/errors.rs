use anchor_lang::prelude::*;

#[error_code]
pub enum KycHookError {
    #[msg("Sender KYC verification required")]
    SenderKycNotVerified,
    #[msg("Sender is on AML blocklist")]
    SenderBlocked,
    #[msg("Sender KYC has expired")]
    SenderKycExpired,
    #[msg("Receiver KYC verification required")]
    ReceiverKycNotVerified,
    #[msg("Receiver is on AML blocklist")]
    ReceiverBlocked,
    #[msg("Receiver KYC has expired")]
    ReceiverKycExpired,
    #[msg("Only admin can perform this action")]
    AdminOnly,
    #[msg("Invalid KYC level (must be 0-3)")]
    InvalidKycLevel,
    #[msg("Expiry date must be in the future")]
    InvalidExpiryDate,
}
