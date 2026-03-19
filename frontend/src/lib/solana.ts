import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

// --- Network Config ---
export const NETWORK = (import.meta.env.VITE_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';
export const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl(NETWORK);
export const connection = new Connection(RPC_URL, 'confirmed');

// --- Program IDs (updated after deployment) ---
export const ESCROW_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_ESCROW_PROGRAM_ID || 'DdfRLgw8YFB8ao4YaKpPfdorEPW1EhoE1gE3FYzdhNnu'
);
export const KYC_HOOK_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_KYC_HOOK_PROGRAM_ID || '5zyZimCxauJ4SsiAkB5PVBTevyLnznRfdoqJs1odjNSN'
);
export const VUSDC_MINT = new PublicKey(
  import.meta.env.VITE_VUSDC_MINT || '11111111111111111111111111111111'
);

// --- Constants ---
export const DECIMALS = 6; // USDC uses 6 decimals on Solana
export const EXPLORER_URL = 'https://explorer.solana.com';

// --- Demo Accounts (devnet) ---
export const DEMO_ACCOUNTS = {
  provider: 'DemoProviderAddressWillBeSetAfterDeployment11111',
  connector: 'DemoConnectorAddressWillBeSetAfterDeployment11111',
  protocol: 'DemoProtocolAddressWillBeSetAfterDeployment11111',
};

// --- Helpers ---
function getClusterParam(): string {
  if (RPC_URL.includes('localhost') || RPC_URL.includes('127.0.0.1')) {
    return `custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  }
  return NETWORK;
}

export function getExplorerTxLink(signature: string): string {
  return `${EXPLORER_URL}/tx/${signature}?cluster=${getClusterParam()}`;
}

export function getExplorerAccountLink(address: string): string {
  return `${EXPLORER_URL}/address/${address}?cluster=${getClusterParam()}`;
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export function formatAmount(lamports: number | bigint | string, decimals = DECIMALS): string {
  const num = typeof lamports === 'string' ? parseInt(lamports) : Number(lamports);
  return (num / Math.pow(10, decimals)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function toContractAmount(humanAmount: number, decimals = DECIMALS): number {
  return Math.round(humanAmount * Math.pow(10, decimals));
}

// --- PDA Derivation Helpers ---
export function getConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow_config')],
    ESCROW_PROGRAM_ID
  );
}

export function getDealPDA(dealId: number): [PublicKey, number] {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(dealId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('deal'), buffer],
    ESCROW_PROGRAM_ID
  );
}

export function getVaultPDA(dealId: number): [PublicKey, number] {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(dealId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), buffer],
    ESCROW_PROGRAM_ID
  );
}

export function getReputationPDA(provider: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('reputation'), provider.toBuffer()],
    ESCROW_PROGRAM_ID
  );
}

export function getKycPDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('kyc'), wallet.toBuffer()],
    KYC_HOOK_PROGRAM_ID
  );
}

export function getKycAdminPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('kyc_admin')],
    KYC_HOOK_PROGRAM_ID
  );
}
