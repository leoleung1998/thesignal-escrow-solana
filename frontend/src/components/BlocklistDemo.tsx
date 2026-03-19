import { useState } from 'react';
import {
  ShieldAlert, ShieldX, ShieldCheck,
  AlertTriangle, Ban, Unlock, Search,
} from 'lucide-react';
import { Card, Button, Tag } from './ui/Components';
import { useKycStatus, KycData } from '../hooks/useKycStatus';
import { truncateAddress, isValidSolanaAddress } from '../lib/solana';

interface BlocklistDemoProps {
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function BlocklistDemo({ onToast }: BlocklistDemoProps) {
  const { fetchKycStatus } = useKycStatus();
  const [targetAddress, setTargetAddress] = useState('');
  const [targetKyc, setTargetKyc] = useState<KycData | null>(null);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [blockHistory, setBlockHistory] = useState<{ address: string; action: 'blocked' | 'unblocked'; timestamp: string }[]>([]);

  const handleCheck = async () => {
    if (!isValidSolanaAddress(targetAddress)) {
      onToast('Invalid Solana address', 'error');
      return;
    }
    setIsChecking(true);
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const kyc = await fetchKycStatus(new PublicKey(targetAddress));
      setTargetKyc(kyc || null);
      if (!kyc) {
        onToast('No KYC record found for this address', 'info');
      }
    } catch {
      onToast('Failed to fetch KYC status', 'error');
    } finally {
      setIsChecking(false);
    }
  };

  const handleBlock = async () => {
    if (!isValidSolanaAddress(targetAddress)) return;
    setIsBlocking(true);
    try {
      // In production, this would call the block_address instruction
      // For demo, we simulate the block
      onToast(
        `Address ${truncateAddress(targetAddress)} blocked on AML list. All token transfers will be rejected by the Transfer Hook.`,
        'error'
      );
      setBlockHistory(prev => [
        { address: targetAddress, action: 'blocked', timestamp: new Date().toLocaleTimeString() },
        ...prev,
      ]);
      if (targetKyc) {
        setTargetKyc({ ...targetKyc, isBlocked: true });
      }
    } catch (err: any) {
      onToast(`Block failed: ${err.message}`, 'error');
    } finally {
      setIsBlocking(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <ShieldAlert size={20} className="text-red-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">AML Blocklist Demo</h3>
          <p className="text-xs text-zinc-500">Simulate blocking addresses at the protocol level</p>
        </div>
      </div>

      {/* Explanation */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-zinc-400">
            <p className="text-red-400 font-bold mb-1">How it works</p>
            <p>
              When an address is blocked, the KYC Transfer Hook sets <code className="text-red-300 bg-red-500/10 px-1 rounded">is_blocked = true</code> on-chain.
              Any subsequent <code className="text-red-300 bg-red-500/10 px-1 rounded">transfer_checked</code> call involving this address
              will fail at the protocol level — the token itself refuses to move.
            </p>
          </div>
        </div>
      </div>

      {/* Address Input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={targetAddress}
          onChange={e => setTargetAddress(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCheck()}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-red-500 transition-colors"
          placeholder="Enter address to check / block..."
        />
        <button
          type="button"
          onClick={handleCheck}
          disabled={isChecking}
          className="px-4 py-3 bg-zinc-800 text-zinc-300 rounded-xl font-bold hover:bg-zinc-700 transition-all disabled:opacity-50"
        >
          <Search size={16} />
        </button>
      </div>

      {/* Current Status */}
      {targetKyc && (
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {targetKyc.isBlocked ? (
                <ShieldX size={18} className="text-red-400" />
              ) : targetKyc.verified ? (
                <ShieldCheck size={18} className="text-emerald-400" />
              ) : (
                <ShieldX size={18} className="text-zinc-500" />
              )}
              <span className="text-white font-mono text-sm">{truncateAddress(targetAddress)}</span>
            </div>
            <Tag color={targetKyc.isBlocked ? 'red' : targetKyc.verified ? 'emerald' : 'zinc'}>
              {targetKyc.isBlocked ? 'BLOCKED' : targetKyc.verified ? 'Verified' : 'Unverified'}
            </Tag>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs mb-4">
            <div>
              <span className="text-zinc-500">KYC Level</span>
              <p className="text-white font-bold">{targetKyc.kycLevel}</p>
            </div>
            <div>
              <span className="text-zinc-500">Country</span>
              <p className="text-white font-bold">{targetKyc.countryCode}</p>
            </div>
            <div>
              <span className="text-zinc-500">Expires</span>
              <p className="text-white font-bold">{new Date(targetKyc.expiresAt * 1000).toLocaleDateString()}</p>
            </div>
          </div>

          {!targetKyc.isBlocked ? (
            <Button
              onClick={handleBlock}
              disabled={isBlocking}
              variant="danger"
              icon={Ban}
              className="w-full"
            >
              {isBlocking ? 'Blocking...' : 'Block Address (AML)'}
            </Button>
          ) : (
            <div className="text-center py-2">
              <p className="text-red-400 text-sm font-bold">
                This address is blocked. All token transfers involving this address will be rejected.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Block History */}
      {blockHistory.length > 0 && (
        <div className="mt-4">
          <h4 className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-3">Recent AML Actions</h4>
          <div className="space-y-2">
            {blockHistory.map((entry, i) => (
              <div key={i} className="flex items-center justify-between bg-zinc-900/30 rounded-lg p-3 border border-zinc-800/50">
                <div className="flex items-center gap-2">
                  {entry.action === 'blocked' ? (
                    <Ban size={14} className="text-red-400" />
                  ) : (
                    <Unlock size={14} className="text-emerald-400" />
                  )}
                  <span className="text-white font-mono text-xs">{truncateAddress(entry.address)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Tag color={entry.action === 'blocked' ? 'red' : 'emerald'}>
                    {entry.action}
                  </Tag>
                  <span className="text-zinc-600 text-xs">{entry.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transfer simulation */}
      <div className="mt-6 bg-zinc-900/30 rounded-xl p-4 border border-zinc-800/50">
        <h4 className="text-zinc-300 text-sm font-bold mb-2">Transfer Hook Enforcement</h4>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-zinc-400">KYC Verified + Not Blocked = <span className="text-emerald-400 font-bold">Transfer APPROVED</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-zinc-400">Not Verified OR Blocked = <span className="text-red-400 font-bold">Transfer REJECTED</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-zinc-400">KYC Expired = <span className="text-amber-400 font-bold">Transfer REJECTED</span></span>
          </div>
        </div>
      </div>
    </Card>
  );
}
