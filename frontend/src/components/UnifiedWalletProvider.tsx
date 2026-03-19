/**
 * UnifiedWalletProvider.tsx
 *
 * React context that merges Privy embedded Solana wallets and
 * extension wallets (Phantom/Solflare via @solana/wallet-adapter)
 * into a single interface.
 *
 * Priority: Privy > Extension.
 *
 * Exports:
 *  - useUnifiedWallet() — full wallet state for App.tsx
 *  - useUnifiedAnchorWallet() — AnchorWallet for useDealEscrow / useKycStatus
 */
import { createContext, useContext, useMemo, useCallback } from 'react';
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSolanaWallet } from '../hooks/useSolanaWallet';
import { usePrivySolanaWallet, type AnchorWalletLike } from '../hooks/usePrivySolanaWallet';

export type WalletSource = 'privy' | 'extension' | null;

export interface UnifiedWalletState {
  /** Which wallet source is currently active */
  activeSource: WalletSource;
  /** Whether any wallet is connected */
  isConnected: boolean;
  /** Active wallet address (base58) */
  address: string;
  /** SOL balance */
  solBalance: string;
  /** vUSDC balance */
  usdcBalance: string;
  /** AnchorWallet-compatible signer for program interactions */
  anchorWallet: AnchorWalletLike | undefined;
  /** Opens Privy login modal (email / social) */
  privyLogin: () => void;
  /** Disconnects the active wallet */
  disconnect: () => void;
  /** Refresh balances */
  refreshBalances: () => Promise<void>;
  /** Privy SDK initialized */
  isPrivyReady: boolean;
  /** Privy auth done but wallet still creating */
  isWalletLoading: boolean;
}

const UnifiedWalletContext = createContext<UnifiedWalletState>({
  activeSource: null,
  isConnected: false,
  address: '',
  solBalance: '0',
  usdcBalance: '0.00',
  anchorWallet: undefined,
  privyLogin: () => {},
  disconnect: () => {},
  refreshBalances: async () => {},
  isPrivyReady: false,
  isWalletLoading: false,
});

export function UnifiedWalletProvider({ children }: { children: React.ReactNode }) {
  const privy = usePrivySolanaWallet();
  const extensionWallet = useSolanaWallet();
  const adapterAnchorWallet = useAnchorWallet();
  const { disconnect: adapterDisconnect } = useWallet();

  // Priority: Privy > Extension
  const activeSource: WalletSource = privy.isConnected
    ? 'privy'
    : extensionWallet.isConnected
    ? 'extension'
    : null;

  const disconnect = useCallback(() => {
    if (activeSource === 'privy') {
      privy.disconnect();
    } else if (activeSource === 'extension') {
      adapterDisconnect();
    }
  }, [activeSource, privy, adapterDisconnect]);

  const refreshBalances = useCallback(async () => {
    if (activeSource === 'privy') {
      await privy.refreshBalances();
    } else if (activeSource === 'extension') {
      await extensionWallet.refreshBalances();
    }
  }, [activeSource, privy, extensionWallet]);

  const value = useMemo((): UnifiedWalletState => ({
    activeSource,
    isConnected: activeSource !== null,
    address: activeSource === 'privy' ? privy.address : extensionWallet.address,
    solBalance: activeSource === 'privy' ? privy.solBalance : extensionWallet.solBalance,
    usdcBalance: activeSource === 'privy' ? privy.usdcBalance : extensionWallet.usdcBalance,
    anchorWallet: activeSource === 'privy' ? privy.anchorWallet : adapterAnchorWallet as AnchorWalletLike | undefined,
    privyLogin: privy.privyLogin,
    disconnect,
    refreshBalances,
    isPrivyReady: privy.isPrivyReady,
    isWalletLoading: privy.isWalletLoading,
  }), [
    activeSource, privy, extensionWallet, adapterAnchorWallet,
    disconnect, refreshBalances,
  ]);

  return (
    <UnifiedWalletContext.Provider value={value}>
      {children}
    </UnifiedWalletContext.Provider>
  );
}

/** Full wallet state for App.tsx / UI components */
export function useUnifiedWallet(): UnifiedWalletState {
  return useContext(UnifiedWalletContext);
}

/** AnchorWallet for hooks (useDealEscrow, useKycStatus) — drop-in replacement for useAnchorWallet() */
export function useUnifiedAnchorWallet(): AnchorWalletLike | undefined {
  return useContext(UnifiedWalletContext).anchorWallet;
}
