import { useState } from 'react';
import {
  Shield, ShieldCheck, ShieldX, ShieldAlert,
  Search, Users, FileWarning, Globe, Clock,
  CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react';
import { Card, Tag } from './ui/Components';
import { useKycStatus, getKycLevelLabel, KycData } from '../hooks/useKycStatus';
import { truncateAddress, isValidSolanaAddress } from '../lib/solana';

interface ParticipantStatus {
  role: string;
  address: string;
  kyc: KycData | null;
  loading: boolean;
  error: boolean;
}

export function ComplianceDashboard() {
  const { fetchKycStatus } = useKycStatus();
  const [lookupAddress, setLookupAddress] = useState('');
  const [participants, setParticipants] = useState<ParticipantStatus[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  // Check compliance for a single address
  const handleLookup = async () => {
    if (!isValidSolanaAddress(lookupAddress)) return;
    setIsChecking(true);
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const kyc = await fetchKycStatus(new PublicKey(lookupAddress));
      setParticipants(prev => {
        const existing = prev.findIndex(p => p.address === lookupAddress);
        const entry: ParticipantStatus = {
          role: 'Lookup',
          address: lookupAddress,
          kyc: kyc || null,
          loading: false,
          error: !kyc,
        };
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = entry;
          return updated;
        }
        return [...prev, entry];
      });
    } catch {
      setParticipants(prev => [
        ...prev,
        { role: 'Lookup', address: lookupAddress, kyc: null, loading: false, error: true },
      ]);
    } finally {
      setIsChecking(false);
    }
  };

  // Check multiple addresses (deal participants)
  const handleBulkCheck = async (addresses: { role: string; address: string }[]) => {
    const { PublicKey } = await import('@solana/web3.js');
    const results = await Promise.all(
      addresses.map(async ({ role, address }) => {
        try {
          const kyc = await fetchKycStatus(new PublicKey(address));
          return { role, address, kyc: kyc || null, loading: false, error: !kyc };
        } catch {
          return { role, address, kyc: null, loading: false, error: true };
        }
      })
    );
    setParticipants(results);
  };

  const getComplianceIcon = (p: ParticipantStatus) => {
    if (p.loading) return <Clock className="w-5 h-5 text-zinc-500 animate-pulse" />;
    if (p.error || !p.kyc) return <ShieldX className="w-5 h-5 text-zinc-500" />;
    if (p.kyc.isBlocked) return <ShieldAlert className="w-5 h-5 text-red-400" />;
    if (p.kyc.expiresAt * 1000 < Date.now()) return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    if (p.kyc.verified) return <ShieldCheck className="w-5 h-5 text-emerald-400" />;
    return <ShieldX className="w-5 h-5 text-zinc-500" />;
  };

  const getComplianceStatus = (p: ParticipantStatus): { label: string; color: 'emerald' | 'red' | 'amber' | 'zinc' } => {
    if (p.loading) return { label: 'Checking...', color: 'zinc' };
    if (p.error || !p.kyc) return { label: 'Not Found', color: 'zinc' };
    if (p.kyc.isBlocked) return { label: 'BLOCKED', color: 'red' };
    if (p.kyc.expiresAt * 1000 < Date.now()) return { label: 'Expired', color: 'amber' };
    if (p.kyc.verified) return { label: 'Verified', color: 'emerald' };
    return { label: 'Unverified', color: 'zinc' };
  };

  const allVerified = participants.length > 0 && participants.every(
    p => p.kyc?.verified && !p.kyc.isBlocked && p.kyc.expiresAt * 1000 > Date.now()
  );
  const hasBlockedParty = participants.some(p => p.kyc?.isBlocked);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Users size={20} className="text-emerald-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Compliance Dashboard</h3>
          <p className="text-xs text-zinc-500">Verify KYC status of deal participants</p>
        </div>
      </div>

      {/* Address Lookup */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={lookupAddress}
          onChange={e => setLookupAddress(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLookup()}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500 transition-colors"
          placeholder="Check any Solana address..."
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={isChecking || !isValidSolanaAddress(lookupAddress)}
          className="px-5 py-3 bg-emerald-500 text-[#02040a] rounded-xl font-bold hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50 flex items-center gap-2"
        >
          <Search size={16} />
          Check
        </button>
      </div>

      {/* Results Grid */}
      {participants.length > 0 && (
        <div className="space-y-3">
          {/* Summary Banner */}
          {allVerified && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <span className="text-emerald-400 text-sm font-bold">All participants KYC verified — Transfer Hook will approve</span>
            </div>
          )}
          {hasBlockedParty && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-400 text-sm font-bold">Blocked address detected — Transfer Hook will REJECT all transfers</span>
            </div>
          )}

          {/* Participant Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {participants.map((p, i) => {
              const status = getComplianceStatus(p);
              return (
                <div key={i} className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getComplianceIcon(p)}
                      <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">{p.role}</span>
                    </div>
                    <Tag color={status.color}>{status.label}</Tag>
                  </div>
                  <p className="text-white font-mono text-xs mb-3">{truncateAddress(p.address)}</p>
                  {p.kyc && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-zinc-500">Level</span>
                        <p className="text-white font-bold">{getKycLevelLabel(p.kyc.kycLevel)}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">Country</span>
                        <p className="text-white font-bold">{p.kyc.countryCode}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">Expires</span>
                        <p className={`font-bold ${p.kyc.expiresAt * 1000 < Date.now() ? 'text-red-400' : 'text-white'}`}>
                          {new Date(p.kyc.expiresAt * 1000).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-zinc-500">Blocked</span>
                        <p className={`font-bold ${p.kyc.isBlocked ? 'text-red-400' : 'text-emerald-400'}`}>
                          {p.kyc.isBlocked ? 'YES' : 'No'}
                        </p>
                      </div>
                    </div>
                  )}
                  {!p.kyc && !p.loading && (
                    <p className="text-zinc-600 text-xs">No KYC record found on-chain</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Travel Rule Info */}
      <div className="mt-6 bg-zinc-900/30 rounded-xl p-4 border border-zinc-800/50">
        <div className="flex items-center gap-2 mb-2">
          <FileWarning size={16} className="text-amber-400" />
          <span className="text-zinc-300 text-sm font-bold">FATF Travel Rule</span>
        </div>
        <p className="text-zinc-500 text-xs leading-relaxed">
          Deals exceeding $3,000 require Travel Rule compliance. Originator and beneficiary information
          is stored as SHA-256 hashes on-chain — real PII stays off-chain with the compliance officer.
          This satisfies FATF Recommendation 16 while preserving privacy.
        </p>
      </div>
    </Card>
  );
}
