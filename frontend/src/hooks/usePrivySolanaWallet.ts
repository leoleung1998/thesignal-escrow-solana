/**
 * usePrivySolanaWallet.ts
 *
 * WalletState-compatible hook powered by Privy embedded Solana wallets.
 * Users authenticate with email / Google / Twitter / Discord → Privy
 * auto-creates a Solana wallet → signing goes through Privy's
 * standard wallet interface.
 *
 * Key API notes (Privy v3.17):
 *  - Hooks come from @privy-io/react-auth/solana (not the main package)
 *  - useWallets() returns ConnectedStandardSolanaWallet[] (Privy embedded)
 *  - useSignTransaction() signs serialized Uint8Array transactions
 *  - useCreateWallet() explicitly creates a Solana embedded wallet
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  useWallets as useSolanaWallets,
  useCreateWallet,
  useSignTransaction,
} from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, VersionedTransaction, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, getAccount, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { VUSDC_MINT, DECIMALS, formatAmount, RPC_URL, NETWORK } from '../lib/solana';

type SolanaChain = 'solana:mainnet' | 'solana:devnet' | 'solana:testnet';

function getSolanaChain(): SolanaChain {
  if (NETWORK === 'mainnet-beta') return 'solana:mainnet';
  if (NETWORK === 'testnet') return 'solana:testnet';
  return 'solana:devnet';
}

/** AnchorWallet-compatible interface */
export interface AnchorWalletLike {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

export interface PrivySolanaWalletState {
  address: string;
  publicKey: PublicKey | null;
  isConnected: boolean;
  isPrivyReady: boolean;
  isWalletLoading: boolean;
  solBalance: string;
  usdcBalance: string;
  anchorWallet: AnchorWalletLike | undefined;
  privyLogin: () => void;
  disconnect: () => Promise<void>;
  refreshBalances: () => Promise<void>;
}

export function usePrivySolanaWallet(): PrivySolanaWalletState {
  const { ready, authenticated, logout, login } = usePrivy();
  const { wallets: solanaWallets, ready: walletsReady } = useSolanaWallets();
  const { createWallet } = useCreateWallet();
  const { signTransaction: privySignTx } = useSignTransaction();

  const [solBalance, setSolBalance] = useState('0');
  const [usdcBalance, setUsdcBalance] = useState('0.00');

  // Find the first Privy embedded Solana wallet
  const embeddedWallet = solanaWallets[0] ?? null;
  const address = embeddedWallet?.address ?? '';
  const isConnected = authenticated && walletsReady && !!embeddedWallet;
  const pubkey = useMemo(() => {
    if (!address) return null;
    try { return new PublicKey(address); } catch { return null; }
  }, [address]);

  // After Privy login, auto-create the Solana wallet if it doesn't exist
  useEffect(() => {
    if (!ready || !authenticated || !walletsReady) return;
    if (embeddedWallet) return; // already exists
    createWallet().catch(() => {
      // Wallet may already exist or creation temporarily unavailable
    });
  }, [authenticated, ready, walletsReady, embeddedWallet, createWallet]);

  // Connection for balance queries (standalone, not from adapter context)
  const connection = useMemo(() => new Connection(RPC_URL, 'confirmed'), []);

  const refreshBalances = useCallback(async () => {
    if (!pubkey) return;
    try {
      const solBal = await connection.getBalance(pubkey);
      setSolBalance((solBal / LAMPORTS_PER_SOL).toFixed(4));
      try {
        const ata = getAssociatedTokenAddressSync(VUSDC_MINT, pubkey, false, TOKEN_2022_PROGRAM_ID);
        const account = await getAccount(connection, ata, 'confirmed', TOKEN_2022_PROGRAM_ID);
        setUsdcBalance(formatAmount(account.amount));
      } catch {
        setUsdcBalance('0.00');
      }
    } catch {
      // RPC not reachable
    }
  }, [pubkey, connection]);

  // Auto-refresh every 15s while connected
  useEffect(() => {
    if (!isConnected || !pubkey) return;
    refreshBalances();
    const interval = setInterval(refreshBalances, 15_000);
    return () => clearInterval(interval);
  }, [isConnected, pubkey, refreshBalances]);

  // Build AnchorWallet-compatible signer
  const anchorWallet = useMemo((): AnchorWalletLike | undefined => {
    if (!isConnected || !pubkey || !embeddedWallet) return undefined;

    const chain = getSolanaChain();

    const signTransaction = async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false } as any);
      const bytes = serialized instanceof Buffer ? new Uint8Array(serialized) : serialized;

      const { signedTransaction } = await privySignTx({
        transaction: bytes,
        wallet: embeddedWallet,
        chain,
      });

      if (tx instanceof VersionedTransaction) {
        return VersionedTransaction.deserialize(signedTransaction) as T;
      }
      return Transaction.from(signedTransaction) as T;
    };

    const signAllTransactions = async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      return Promise.all(txs.map(tx => signTransaction(tx)));
    };

    return { publicKey: pubkey, signTransaction, signAllTransactions };
  }, [isConnected, pubkey, embeddedWallet, privySignTx]);

  const disconnect = useCallback(async () => {
    try { await logout(); } catch { /* ignore */ }
    setSolBalance('0');
    setUsdcBalance('0.00');
  }, [logout]);

  return {
    address,
    publicKey: pubkey,
    isConnected,
    isPrivyReady: ready,
    isWalletLoading: ready && authenticated && walletsReady && !embeddedWallet,
    solBalance,
    usdcBalance,
    anchorWallet,
    privyLogin: login,
    disconnect,
    refreshBalances,
  };
}
