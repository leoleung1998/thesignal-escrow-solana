import { useState, useCallback, useContext, createContext, useRef, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  Award, Zap, ArrowRightLeft,
  Shield, FileText, LayoutDashboard,
  Network, Cpu, Lock, Plus, X,
  TerminalSquare, Activity, Globe2,
  Copy, Check, LogOut, Building2,
  ExternalLink, CheckCircle, AlertCircle, Info,
} from 'lucide-react';
import { SignalLogo, GlowingBackground } from './components/ui/Branding';
import { Card, Button, Tag } from './components/ui/Components';
import { KycVerification } from './components/KycVerification';
import { ComplianceDashboard } from './components/ComplianceDashboard';
import { BlocklistDemo } from './components/BlocklistDemo';
import { useSolanaWallet } from './hooks/useSolanaWallet';
import { useDealEscrow, DealData } from './hooks/useDealEscrow';
import {
  truncateAddress,
  getExplorerTxLink,
  formatAmount,
  toContractAmount,
  isValidSolanaAddress,
  DECIMALS,
  NETWORK,
} from './lib/solana';
import { saveDealMetadata, recordMilestoneEvent } from './lib/dealMetadata';

/* ============================================
   Toast Notification System (with exit anim)
   ============================================ */
type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType; exiting?: boolean }

const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => {});
export const useToast = () => useContext(ToastContext);

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-16 lg:bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-md transition-all duration-300 max-w-sm cursor-pointer ${
            t.exiting ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          } ${
            t.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
            t.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
            'bg-zinc-800/80 border-zinc-700 text-zinc-300'
          }`}
          onClick={() => onDismiss(t.id)}
        >
          {t.type === 'success' ? <CheckCircle size={16} /> : t.type === 'error' ? <AlertCircle size={16} /> : <Info size={16} />}
          <span className="text-sm font-medium flex-1">{t.message}</span>
          <button type="button" className="opacity-50 hover:opacity-100" title="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

/* ============================================
   Live Network Ticker (real on-chain data)
   ============================================ */
interface TickerItem { label: string; amount: string; type: string }

const STATUS_ACTION_MAP: Record<string, string> = {
  Created: 'AWAITING_FUNDING',
  Active: 'ESCROW_ACTIVE',
  Completed: 'DEAL_COMPLETED',
  Cancelled: 'DEAL_CANCELLED',
  Disputed: 'DISPUTE_OPEN',
};

const TICKER_TYPE_COLORS: Record<string, string> = {
  DEAL_COMPLETED:     'text-emerald-400',
  MILESTONE_RELEASED: 'text-emerald-400',
  ESCROW_ACTIVE:      'text-blue-400',
  MILESTONE_FUNDED:   'text-blue-400',
  AWAITING_FUNDING:   'text-amber-400',
  DISPUTE_OPEN:       'text-red-400',
  DEAL_CANCELLED:     'text-zinc-600',
};

function dealToTickerItems(deal: DealData): TickerItem[] {
  const idLabel = `DEAL #${String(deal.dealId).padStart(3, '0')}`;
  const usdcStr = formatAmount(deal.totalAmount);
  const items: TickerItem[] = [
    { label: idLabel, amount: usdcStr, type: STATUS_ACTION_MAP[deal.status] || deal.status.toUpperCase() },
  ];
  deal.milestones.forEach((m, i) => {
    if (m.status === 'Released' || m.status === 'Funded') {
      items.push({
        label: `${idLabel} · MS${i + 1}`,
        amount: formatAmount(m.amount),
        type: m.status === 'Released' ? 'MILESTONE_RELEASED' : 'MILESTONE_FUNDED',
      });
    }
  });
  return items;
}

function LiveTicker({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="w-full bg-[#050505] border-b border-zinc-900 flex items-center h-9 overflow-hidden text-[10px] font-mono font-bold uppercase tracking-widest relative z-40">
      <div className="bg-emerald-500 text-[#010205] h-full px-4 flex items-center justify-center shrink-0 shadow-[10px_0_20px_rgba(0,0,0,0.9)]">
        <Activity size={11} className="mr-2 animate-pulse" />
        Live Network
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="flex whitespace-nowrap animate-marquee w-max">
          {doubled.map((item, i) => (
            <div key={i} className="flex items-center gap-4 px-8">
              <span className="text-zinc-500">{item.label}</span>
              <span className={TICKER_TYPE_COLORS[item.type] ?? 'text-zinc-600'}>{item.type}</span>
              <span className="text-zinc-300 font-bold">{item.amount} vUSDC</span>
              <span className="text-zinc-800">&middot;</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================
   Tab Configuration
   ============================================ */
type TabId = 'compliance' | 'create' | 'deals' | 'oracle';

const TABS: { id: TabId; label: string; mobileLabel: string; icon: any }[] = [
  { id: 'compliance', label: 'Compliance', mobileLabel: 'KYC', icon: Shield },
  { id: 'create', label: 'Deploy Contract', mobileLabel: 'Deploy', icon: Plus },
  { id: 'deals', label: 'Deals', mobileLabel: 'Deals', icon: TerminalSquare },
  { id: 'oracle', label: 'Oracle', mobileLabel: 'Oracle', icon: Award },
];

/* ============================================
   Landing Page View (pre-connect)
   ============================================ */
function LandingView({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] text-center px-2 sm:px-4 animate-fade-in relative z-10 pt-6 lg:pt-10">
      {/* Network badge */}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/50 border border-emerald-500/20 text-emerald-400 mb-8 lg:mb-12 backdrop-blur-md shadow-[0_0_20px_rgba(16,185,129,0.1)] hover:border-emerald-500/50 transition-colors cursor-default">
        <span className="relative flex h-2.5 w-2.5 lg:h-3 lg:w-3 mr-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 lg:h-3 lg:w-3 bg-emerald-500" />
        </span>
        <span className="text-[9px] lg:text-[10px] font-black tracking-[0.2em] lg:tracking-[0.3em] uppercase">Solana {NETWORK}</span>
      </div>

      {/* Hero */}
      <div className="glitch-wrapper relative mb-6 lg:mb-10">
        <h1
          className="glitch-text text-[3rem] sm:text-[4.5rem] md:text-[6rem] lg:text-[10rem] font-black text-white tracking-tighter leading-[0.9]"
          data-text="Trust Engine."
        >
          Trust Engine.
        </h1>
      </div>

      <p className="text-base lg:text-xl text-zinc-400 max-w-2xl mb-8 lg:mb-14 leading-relaxed font-light px-2">
        Institutional stablecoin escrow with KYC-gated transfers, atomic 3-party splits,
        and on-chain reputation.{' '}
        <span className="text-white font-medium border-b border-zinc-600 pb-0.5">Compliance is Law.</span>
      </p>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-4 lg:gap-6 mb-16 lg:mb-32 relative w-full sm:w-auto px-2 sm:px-0">
        <div className="absolute -inset-6 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none" />
        <Button onClick={onConnect} variant="primary" className="px-8 lg:px-10 py-4 lg:py-5 w-full sm:w-auto relative z-10" icon={TerminalSquare}>
          Connect Wallet
        </Button>
        <a href="https://github.com/SamirStream/The-Signal-Escrow-Institutional-Stablecoin-Escrow-on-Solana" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto relative z-10">
          <Button variant="secondary" className="px-8 lg:px-10 py-4 lg:py-5 w-full h-full" icon={Globe2}>
            Read the Docs
          </Button>
        </a>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-6 w-full max-w-7xl relative">
        <div className="hidden md:block absolute top-1/2 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent -translate-y-1/2 z-0" />

        {[
          { icon: Lock, title: "Transfer Hook KYC", desc: "Every token movement verified by on-chain KYC compliance layer.", color: "text-emerald-400" },
          { icon: Network, title: "Atomic 3-Way Split", desc: "Provider, connector & protocol paid in a single indivisible transaction.", color: "text-emerald-300" },
          { icon: Cpu, title: "On-Chain Reputation", desc: "Immutable trust score generated by completed escrow milestones.", color: "text-green-400" },
          { icon: Shield, title: "Travel Rule Ready", desc: "Hashed PII records for FATF Travel Rule compliance on deals >= $3,000.", color: "text-emerald-500" },
        ].map((feature, idx) => (
          <Card key={idx} className="p-4 lg:p-8 text-left z-10 bg-[#09090b] shadow-xl" hoverEffect glowOnHover>
            <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 lg:mb-6 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]">
              <feature.icon size={20} className={`${feature.color} lg:!w-7 lg:!h-7`} />
            </div>
            <h3 className="text-sm lg:text-xl font-bold text-white mb-1.5 lg:mb-3 tracking-tight">{feature.title}</h3>
            <p className="text-zinc-400 text-xs lg:text-sm leading-relaxed font-medium">{feature.desc}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================================
   Main App
   ============================================ */
export default function App() {
  const { connected, publicKey, disconnect } = useWallet();
  const wallet = useSolanaWallet();
  const escrow = useDealEscrow();

  const [activeTab, setActiveTab] = useState<TabId>('compliance');
  const [lastCreatedDealId, setLastCreatedDealId] = useState<number | null>(null);

  // --- Toast system with exit animation ---
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t)), 4500);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
  }, []);

  // --- Live Ticker (fetched on mount, read-only) ---
  const [tickerItems, setTickerItems] = useState<TickerItem[]>([]);
  const escrowRef = useRef(escrow);
  useEffect(() => { escrowRef.current = escrow; });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const count = await escrowRef.current.getDealCount();
        if (count === 0 || cancelled) return;
        const n = Math.min(count, 10);
        const start = Math.max(0, count - n);
        const results = await Promise.allSettled(
          Array.from({ length: n }, (_, i) => escrowRef.current.getDeal(start + i))
        );
        const newItems: TickerItem[] = results.flatMap((r, idx) => {
          if (r.status !== 'fulfilled' || !r.value) return [];
          return dealToTickerItems(r.value);
        });
        if (!cancelled && newItems.length > 0) setTickerItems(newItems);
      } catch { /* chain not reachable */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // --- Keyboard tab navigation (Alt+1/2/3/4) ---
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!e.altKey || !connected) return;
      const tabMap: Record<string, TabId> = { '1': 'compliance', '2': 'create', '3': 'deals', '4': 'oracle' };
      const tab = tabMap[e.key];
      if (tab) { e.preventDefault(); setActiveTab(tab); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [connected]);

  // --- Deal creation state ---
  const [providerAddr, setProviderAddr] = useState('');
  const [connectorAddr, setConnectorAddr] = useState('');
  const [platformFee, setPlatformFee] = useState(10);
  const [connectorShare, setConnectorShare] = useState(40);
  const [milestones, setMilestones] = useState([
    { name: 'Phase 1 — Security Audit', amount: 3000 },
    { name: 'Phase 2 — Implementation', amount: 5000 },
    { name: 'Phase 3 — Final Review', amount: 2000 },
  ]);
  const [dealTitle, setDealTitle] = useState('Security Audit');

  // --- Deal list state ---
  const [deals, setDeals] = useState<DealData[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<DealData | null>(null);
  const [dealCount, setDealCount] = useState(0);

  // --- Reputation state ---
  const [repAddress, setRepAddress] = useState('');
  const [repScore, setRepScore] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ address: string; score: number }[]>([]);

  // --- Refresh deals ---
  const refreshDeals = useCallback(async () => {
    if (!connected) return;
    try {
      const count = await escrow.getDealCount();
      setDealCount(count);
      const loaded: DealData[] = [];
      for (let i = 0; i < Math.min(count, 20); i++) {
        const deal = await escrow.getDeal(i);
        if (deal) loaded.push(deal);
      }
      setDeals(loaded);
    } catch (err) {
      console.error('Failed to fetch deals:', err);
    }
  }, [connected, escrow]);

  useEffect(() => {
    if (connected && activeTab === 'deals') refreshDeals();
  }, [connected, activeTab, refreshDeals]);

  // Auto-navigate to deals after creation
  useEffect(() => {
    if (lastCreatedDealId !== null && activeTab === 'deals') {
      refreshDeals();
    }
  }, [lastCreatedDealId, activeTab, refreshDeals]);

  // --- Create Deal ---
  const handleCreateDeal = async () => {
    if (!isValidSolanaAddress(providerAddr)) {
      addToast('Invalid provider Solana address', 'error');
      return;
    }
    if (!isValidSolanaAddress(connectorAddr)) {
      addToast('Invalid connector Solana address', 'error');
      return;
    }
    if (milestones.length === 0) {
      addToast('Add at least one milestone', 'error');
      return;
    }
    try {
      const amounts = milestones.map(m => toContractAmount(m.amount));
      const { dealId, txHash } = await escrow.createDeal(
        providerAddr, connectorAddr,
        platformFee * 100, connectorShare * 100,
        amounts,
      );
      saveDealMetadata(dealId, {
        title: dealTitle,
        description: '',
        milestoneNames: milestones.map(m => m.name),
        createdAt: new Date().toISOString(),
        txHash,
      });
      addToast(`Deal #${dealId} deployed on-chain!`, 'success');
      setLastCreatedDealId(dealId);
      setActiveTab('deals');
      refreshDeals();
    } catch (err: any) {
      addToast(`Failed: ${err.message}`, 'error');
    }
  };

  // --- Deposit ---
  const handleDeposit = async (dealId: number, milestoneIdx: number) => {
    try {
      const { txHash } = await escrow.deposit(dealId, milestoneIdx);
      recordMilestoneEvent(dealId, milestoneIdx, {
        action: 'funded', timestamp: new Date().toISOString(), txHash,
      });
      addToast(`Milestone ${milestoneIdx + 1} funded!`, 'success');
      const updated = await escrow.getDeal(dealId);
      if (updated) setSelectedDeal(updated);
      refreshDeals();
    } catch (err: any) {
      addToast(`Deposit failed: ${err.message}`, 'error');
    }
  };

  // --- Release ---
  const handleRelease = async (deal: DealData, milestoneIdx: number) => {
    try {
      const { txHash } = await escrow.releaseMilestone(
        deal.dealId, milestoneIdx,
        deal.provider, deal.connector, deal.protocolWallet,
      );
      const amount = deal.milestones[milestoneIdx].amount;
      const fee = Math.floor(amount * deal.platformFeeBps / 10000);
      const connCut = Math.floor(fee * deal.connectorShareBps / 10000);
      recordMilestoneEvent(deal.dealId, milestoneIdx, {
        action: 'released', timestamp: new Date().toISOString(), txHash,
        split: {
          providerAmount: formatAmount(amount - fee),
          connectorAmount: formatAmount(connCut),
          protocolAmount: formatAmount(fee - connCut),
        },
      });
      addToast(`Milestone ${milestoneIdx + 1} released with atomic 3-way split!`, 'success');
      const updated = await escrow.getDeal(deal.dealId);
      if (updated) setSelectedDeal(updated);
      refreshDeals();
    } catch (err: any) {
      addToast(`Release failed: ${err.message}`, 'error');
    }
  };

  // --- Dispute ---
  const handleDispute = async (dealId: number, milestoneIdx: number) => {
    try {
      const { txHash } = await escrow.dispute(dealId, milestoneIdx);
      recordMilestoneEvent(dealId, milestoneIdx, {
        action: 'disputed', timestamp: new Date().toISOString(), txHash,
      });
      addToast('Dispute filed on-chain', 'info');
      const updated = await escrow.getDeal(dealId);
      if (updated) setSelectedDeal(updated);
      refreshDeals();
    } catch (err: any) {
      addToast(`Dispute failed: ${err.message}`, 'error');
    }
  };

  // --- Reputation ---
  const handleRepLookup = async () => {
    if (!isValidSolanaAddress(repAddress)) {
      addToast('Invalid Solana address', 'error');
      return;
    }
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const score = await escrow.getReputation(new PublicKey(repAddress));
      setRepScore(score);
    } catch {
      setRepScore(0);
    }
  };

  // --- Wallet chip ---
  const truncWallet = wallet.address ? `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}` : '';
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    if (!wallet.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [wallet.address]);

  const statusColor = (status: string): 'emerald' | 'amber' | 'red' | 'blue' | 'zinc' => {
    switch (status) {
      case 'Active': case 'Completed': return 'emerald';
      case 'Created': return 'blue';
      case 'Disputed': return 'red';
      case 'Cancelled': return 'zinc';
      default: return 'zinc';
    }
  };

  const milestoneStatusColor = (status: string): string => {
    switch (status) {
      case 'Funded': return 'text-emerald-400';
      case 'Released': return 'text-green-300';
      case 'Pending': return 'text-zinc-500';
      case 'Disputed': return 'text-red-400';
      case 'Refunded': return 'text-amber-400';
      default: return 'text-zinc-500';
    }
  };

  const handleWalletConnect = useCallback(() => {
    // WalletMultiButton handles this, but we need a callback for the landing page
    document.querySelector<HTMLButtonElement>('.wallet-adapter-button')?.click();
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      <div className="min-h-screen bg-[#02040a] text-zinc-200 selection:bg-emerald-500/30 overflow-x-hidden relative flex flex-col">
        <GlowingBackground />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />

        {/* Live Ticker — homepage only */}
        {!connected && tickerItems.length > 0 && <LiveTicker items={tickerItems} />}

        {/* Header */}
        <header className="relative z-50 border-b border-zinc-800/80 bg-[#02040a]/80 backdrop-blur-2xl sticky top-0">
          <div className="max-w-[90rem] mx-auto px-3 lg:px-6 h-14 lg:h-20 flex items-center justify-between">
            {/* Logo */}
            <a href="https://thesignal.directory" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 lg:gap-4 cursor-pointer group">
              <SignalLogo className="w-8 h-8 lg:w-10 lg:h-10" />
              <div className="flex flex-col">
                <span className="font-display text-lg lg:text-2xl text-white group-hover:text-emerald-400 transition-colors leading-none">THE SIGNAL</span>
                <span className="hidden lg:block text-[9px] font-mono text-zinc-500 uppercase tracking-[0.3em] mt-0.5">Institutional Escrow</span>
              </div>
            </a>

            {connected ? (
              <div className="flex items-center gap-6">
                {/* Desktop tabs in header */}
                <nav className="hidden lg:flex gap-1.5">
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 border ${
                        activeTab === tab.id
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[inset_0_0_20px_rgba(74,222,128,0.05)]'
                          : 'text-zinc-500 hover:text-white border-transparent hover:bg-zinc-900/60'
                      }`}
                    >
                      <tab.icon size={14} />
                      {tab.label}
                    </button>
                  ))}
                </nav>

                {/* Connected Wallet Chip */}
                <div className="flex items-center gap-2 lg:gap-3 bg-[#09090b] border border-zinc-800/80 rounded-xl lg:rounded-2xl pl-3 lg:pl-4 pr-1 lg:pr-1.5 py-1 lg:py-1.5 shadow-xl">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-xs font-mono text-emerald-400 font-bold">{wallet.solBalance} SOL</span>
                    <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">{NETWORK}</span>
                  </div>
                  <div className="bg-[#02040a] text-emerald-100 text-xs font-mono font-bold px-2 lg:px-3 py-2 lg:py-2.5 rounded-lg lg:rounded-xl border border-zinc-800 shadow-[inset_0_0_10px_rgba(16,185,129,0.05)] flex items-center gap-1.5 lg:gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] shrink-0 animate-pulse-ring" />
                    <button onClick={handleCopy} title="Copy address" className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors">
                      {truncWallet}
                      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="text-zinc-600" />}
                    </button>
                    <span className="w-px h-4 bg-zinc-800 mx-0.5" />
                    <button
                      onClick={() => disconnect()}
                      title="Disconnect wallet"
                      className="flex items-center gap-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all px-1.5 lg:px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                    >
                      <LogOut size={12} />
                      <span className="hidden lg:inline">Disconnect</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Tag color="blue">{NETWORK}</Tag>
                <WalletMultiButton />
              </div>
            )}
          </div>
        </header>

        {/* Feature Banner (when connected) */}
        {connected && (
          <div className="relative z-10 bg-gradient-to-r from-emerald-500/5 via-transparent to-emerald-500/5 border-b border-zinc-800/30">
            <div className="max-w-[90rem] mx-auto px-4 py-2.5 flex items-center justify-center gap-6 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              <span className="flex items-center gap-1.5"><Lock size={11} className="text-emerald-400" /> Transfer Hook KYC</span>
              <span className="hidden sm:flex items-center gap-1.5"><Zap size={11} className="text-emerald-400" /> Atomic 3-Way Split</span>
              <span className="hidden md:flex items-center gap-1.5"><Building2 size={11} className="text-emerald-400" /> Token-2022</span>
              <span className="hidden lg:flex items-center gap-1.5"><Shield size={11} className="text-emerald-400" /> Travel Rule</span>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="relative z-10 max-w-[90rem] mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-10 flex-1 w-full pb-20 lg:pb-0">
          {!connected ? (
            <LandingView onConnect={handleWalletConnect} />
          ) : activeTab === 'compliance' ? (
            /* --- COMPLIANCE TAB --- */
            <div className="space-y-8 animate-fade-in">
              <KycVerification address={wallet.address} onToast={addToast} />
              <ComplianceDashboard />
              <BlocklistDemo onToast={addToast} />
            </div>
          ) : activeTab === 'create' ? (
            /* --- CREATE DEAL TAB --- */
            <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
              <Card className="p-6 lg:p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <FileText size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display text-white">Deploy New Contract</h2>
                    <p className="text-xs text-zinc-500">Create an on-chain escrow with milestone-locked payments</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-2">Deal Title</label>
                    <input
                      type="text"
                      value={dealTitle}
                      onChange={e => setDealTitle(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="Security Audit — Q1 2026"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-2">Provider Address</label>
                    <input
                      type="text"
                      value={providerAddr}
                      onChange={e => setProviderAddr(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="Provider Solana address..."
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-2">Connector (BD) Address</label>
                    <input
                      type="text"
                      value={connectorAddr}
                      onChange={e => setConnectorAddr(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="Business dev Solana address..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-2">Platform Fee (%)</label>
                      <input
                        type="number"
                        value={platformFee}
                        onChange={e => setPlatformFee(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                        min={0} max={50}
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-2">Connector Share (%)</label>
                      <input
                        type="number"
                        value={connectorShare}
                        onChange={e => setConnectorShare(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                        min={0} max={100}
                      />
                    </div>
                  </div>

                  {/* Milestones */}
                  <div>
                    <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-3">
                      Milestones ({milestones.length}/10)
                    </label>
                    <div className="space-y-2">
                      {milestones.map((m, i) => (
                        <div key={i} className="flex gap-2 group">
                          <input
                            type="text"
                            value={m.name}
                            onChange={e => {
                              const updated = [...milestones];
                              updated[i] = { ...updated[i], name: e.target.value };
                              setMilestones(updated);
                            }}
                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                            placeholder="Milestone name"
                          />
                          <div className="relative">
                            <input
                              type="number"
                              value={m.amount}
                              onChange={e => {
                                const updated = [...milestones];
                                updated[i] = { ...updated[i], amount: Number(e.target.value) };
                                setMilestones(updated);
                              }}
                              className="w-32 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                              placeholder="Amount"
                              min={1}
                            />
                          </div>
                          <button
                            type="button"
                            title="Remove milestone"
                            onClick={() => setMilestones(milestones.filter((_, idx) => idx !== i))}
                            className="text-zinc-700 hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      {milestones.length < 10 && (
                        <button
                          onClick={() => setMilestones([...milestones, { name: `Phase ${milestones.length + 1}`, amount: 1000 }])}
                          className="text-emerald-400 text-sm hover:text-emerald-300 font-medium"
                        >
                          + Add Milestone
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Fee Breakdown Visual */}
                  <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider mb-4 font-bold">Fee Breakdown per Release</p>
                    {/* Visual bar */}
                    <div className="h-3 rounded-full overflow-hidden flex mb-4 bg-zinc-800">
                      <div className="bg-emerald-500 transition-all" style={{ width: `${100 - platformFee}%` }} title="Provider" />
                      <div className="bg-blue-500 transition-all" style={{ width: `${platformFee * connectorShare / 100}%` }} title="Connector" />
                      <div className="bg-purple-500 transition-all" style={{ width: `${platformFee * (100 - connectorShare) / 100}%` }} title="Protocol" />
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="w-2 h-2 rounded-full bg-emerald-500 mx-auto mb-1" />
                        <p className="text-white font-bold text-lg">{100 - platformFee}%</p>
                        <p className="text-zinc-500 text-xs">Provider</p>
                      </div>
                      <div>
                        <div className="w-2 h-2 rounded-full bg-blue-500 mx-auto mb-1" />
                        <p className="text-white font-bold text-lg">{(platformFee * connectorShare / 100).toFixed(1)}%</p>
                        <p className="text-zinc-500 text-xs">Connector</p>
                      </div>
                      <div>
                        <div className="w-2 h-2 rounded-full bg-purple-500 mx-auto mb-1" />
                        <p className="text-white font-bold text-lg">{(platformFee * (100 - connectorShare) / 100).toFixed(1)}%</p>
                        <p className="text-zinc-500 text-xs">Protocol</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-zinc-800 text-center">
                      <p className="text-zinc-400 text-sm">Total Deal Value: <span className="text-emerald-400 font-bold text-lg">{milestones.reduce((s, m) => s + m.amount, 0).toLocaleString()} vUSDC</span></p>
                    </div>
                  </div>

                  <button
                    onClick={handleCreateDeal}
                    disabled={escrow.isProcessing}
                    className="w-full bg-emerald-500 text-[#02040a] font-black py-4 rounded-xl hover:shadow-[0_0_35px_rgba(16,185,129,0.5)] transition-all disabled:opacity-50 uppercase tracking-wider text-sm"
                  >
                    {escrow.isProcessing ? 'Deploying Contract...' : 'Deploy Escrow Contract'}
                  </button>
                </div>
              </Card>
            </div>
          ) : activeTab === 'deals' ? (
            /* --- DEALS TAB --- */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
              {/* Deal List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-display text-white">Active Contracts ({dealCount})</h2>
                  <button onClick={refreshDeals} className="text-emerald-400 text-xs hover:text-emerald-300 font-bold uppercase tracking-wider">
                    Refresh
                  </button>
                </div>
                {deals.length === 0 ? (
                  <Card className="p-8 text-center">
                    <LayoutDashboard className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500 mb-4">No contracts deployed yet</p>
                    <Button onClick={() => setActiveTab('create')} variant="primary" className="mx-auto">
                      Deploy First Contract
                    </Button>
                  </Card>
                ) : (
                  deals.map(deal => (
                    <Card
                      key={deal.dealId}
                      className={`p-4 cursor-pointer transition-all ${selectedDeal?.dealId === deal.dealId ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : ''}`}
                      hoverEffect
                      onClick={() => setSelectedDeal(deal)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-bold">Deal #{deal.dealId}</span>
                        <Tag color={statusColor(deal.status)}>{deal.status}</Tag>
                      </div>
                      <p className="text-zinc-400 text-xs">
                        {formatAmount(deal.totalAmount)} vUSDC | {deal.milestoneCount} milestones
                      </p>
                      <p className="text-zinc-600 text-xs mt-1 font-mono">
                        Provider: {truncateAddress(deal.provider)}
                      </p>
                      {/* Progress bar */}
                      <div className="mt-3 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{
                            width: `${deal.milestones.filter(m => m.status === 'Released').length / deal.milestoneCount * 100}%`
                          }}
                        />
                      </div>
                    </Card>
                  ))
                )}
              </div>

              {/* Deal Detail */}
              <div className="lg:col-span-2">
                {selectedDeal ? (
                  <Card className="p-6 lg:p-8">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-xl font-display text-white">Deal #{selectedDeal.dealId}</h3>
                        <p className="text-zinc-400 text-sm">{formatAmount(selectedDeal.totalAmount)} vUSDC total</p>
                      </div>
                      <Tag color={statusColor(selectedDeal.status)}>{selectedDeal.status}</Tag>
                    </div>

                    {/* Participants */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                      {[
                        { role: 'Client', addr: selectedDeal.client, icon: '🏢' },
                        { role: 'Provider', addr: selectedDeal.provider, icon: '🔧' },
                        { role: 'Connector', addr: selectedDeal.connector, icon: '🤝' },
                      ].map(({ role, addr, icon }) => (
                        <div key={role} className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-800">
                          <div className="flex items-center gap-2 mb-1">
                            <span>{icon}</span>
                            <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">{role}</p>
                          </div>
                          <p className="text-white font-mono text-xs">{truncateAddress(addr)}</p>
                          {addr === wallet.address && (
                            <Tag color="emerald" className="mt-1">You</Tag>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Fee Structure */}
                    <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 mb-6">
                      <div className="flex items-center justify-between">
                        <p className="text-zinc-400 text-xs uppercase tracking-wider font-bold">Fee Structure</p>
                        <p className="text-zinc-300 text-sm">
                          Platform: <span className="text-white font-bold">{selectedDeal.platformFeeBps / 100}%</span> |
                          Connector: <span className="text-white font-bold">{selectedDeal.connectorShareBps / 100}%</span> of fee
                        </p>
                      </div>
                    </div>

                    {/* Milestones */}
                    <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                      <Activity size={16} className="text-emerald-400" />
                      Milestones ({selectedDeal.milestones.filter(m => m.status === 'Released').length}/{selectedDeal.milestoneCount})
                    </h4>
                    <div className="space-y-3">
                      {selectedDeal.milestones.map((m, i) => (
                        <div key={i} className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-white font-medium">
                              Milestone {i + 1} — {formatAmount(m.amount)} vUSDC
                            </p>
                            <p className={`text-xs font-bold uppercase ${milestoneStatusColor(m.status)}`}>
                              {m.status}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {m.status === 'Pending' && selectedDeal.client === wallet.address && (
                              <button
                                onClick={() => handleDeposit(selectedDeal.dealId, i)}
                                disabled={escrow.isProcessing}
                                className="px-4 py-2 bg-emerald-500 text-[#02040a] rounded-lg text-xs font-bold hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50"
                              >
                                Fund
                              </button>
                            )}
                            {m.status === 'Funded' && selectedDeal.client === wallet.address && (
                              <>
                                <button
                                  onClick={() => handleRelease(selectedDeal, i)}
                                  disabled={escrow.isProcessing}
                                  className="px-4 py-2 bg-emerald-500 text-[#02040a] rounded-lg text-xs font-bold hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50"
                                >
                                  Release
                                </button>
                                <button
                                  onClick={() => handleDispute(selectedDeal.dealId, i)}
                                  disabled={escrow.isProcessing}
                                  className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold hover:bg-red-500/20 disabled:opacity-50"
                                >
                                  Dispute
                                </button>
                              </>
                            )}
                            {m.status === 'Funded' && selectedDeal.provider === wallet.address && (
                              <button
                                onClick={() => handleDispute(selectedDeal.dealId, i)}
                                disabled={escrow.isProcessing}
                                className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold hover:bg-red-500/20 disabled:opacity-50"
                              >
                                Dispute
                              </button>
                            )}
                            {m.status === 'Released' && (
                              <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                                <CheckCircle size={14} /> Complete
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : (
                  <Card className="p-12 text-center">
                    <LayoutDashboard className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
                    <p className="text-zinc-500 text-lg mb-2">Select a contract</p>
                    <p className="text-zinc-600 text-sm">Click a deal to view milestone details and actions</p>
                  </Card>
                )}
              </div>
            </div>
          ) : activeTab === 'oracle' ? (
            /* --- ORACLE TAB --- */
            <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
              {/* Reputation Lookup */}
              <Card className="p-6 lg:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Award size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display text-white">On-Chain Reputation Oracle</h2>
                    <p className="text-xs text-zinc-500">Immutable trust scores from completed escrow milestones</p>
                  </div>
                </div>

                <p className="text-zinc-400 text-sm mb-6 border-l-2 border-emerald-500/30 pl-4">
                  Reputation is generated by the protocol — it increments only when <strong className="text-white">all milestones</strong> in
                  a deal are released. No human can modify it. The on-chain counter is the single source of truth.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={repAddress}
                    onChange={e => setRepAddress(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRepLookup()}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                    placeholder="Provider address..."
                  />
                  <button
                    type="button"
                    onClick={handleRepLookup}
                    className="px-6 py-3 bg-emerald-500 text-[#02040a] rounded-xl font-bold hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
                  >
                    Lookup
                  </button>
                </div>

                {repScore !== null && (
                  <div className="mt-6 text-center bg-zinc-900/50 rounded-xl p-8 border border-zinc-800">
                    {/* Visual score dots */}
                    <div className="flex justify-center gap-1.5 mb-4">
                      {Array.from({ length: Math.max(repScore, 5) }, (_, i) => (
                        <div
                          key={i}
                          className={`w-3 h-3 rounded-full transition-all duration-500 ${
                            i < repScore
                              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                              : 'bg-zinc-800'
                          }`}
                          style={{ transitionDelay: `${i * 80}ms` }}
                        />
                      ))}
                    </div>
                    <p className="text-6xl font-display text-emerald-400 mb-2">{repScore}</p>
                    <p className="text-zinc-400 text-sm font-medium">Completed Deals</p>
                    <p className="text-zinc-600 text-xs mt-2 font-mono">{truncateAddress(repAddress)}</p>
                    <div className="mt-3">
                      {repScore >= 10 && <Tag color="emerald" className="mt-1">Elite Provider</Tag>}
                      {repScore >= 5 && repScore < 10 && <Tag color="emerald" className="mt-1">Trusted Provider</Tag>}
                      {repScore >= 1 && repScore < 5 && <Tag color="blue" className="mt-1">Verified Provider</Tag>}
                      {repScore === 0 && <Tag color="zinc" className="mt-1">New Provider</Tag>}
                    </div>
                  </div>
                )}

                {/* Quick lookup for own address */}
                {wallet.address && (
                  <button
                    type="button"
                    onClick={() => {
                      setRepAddress(wallet.address);
                      setTimeout(handleRepLookup, 100);
                    }}
                    className="mt-4 text-xs text-zinc-500 hover:text-emerald-400 transition-colors"
                  >
                    Check my own reputation
                  </button>
                )}
              </Card>

              {/* Network Leaderboard */}
              <Card className="p-6 lg:p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Activity size={18} className="text-emerald-400" />
                    Network Leaderboard
                  </h3>
                  <Tag color="blue">{dealCount} deals on-chain</Tag>
                </div>

                {deals.length > 0 ? (
                  <div className="space-y-6">
                    {/* Top Providers */}
                    <div>
                      <h4 className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-3">Top Providers (by completed deals)</h4>
                      <div className="space-y-2">
                        {(() => {
                          const providerMap = new Map<string, { completed: number; total: number }>();
                          deals.forEach(d => {
                            const key = d.provider;
                            const existing = providerMap.get(key) || { completed: 0, total: 0 };
                            existing.total++;
                            if (d.status === 'Completed') existing.completed++;
                            providerMap.set(key, existing);
                          });
                          return Array.from(providerMap.entries())
                            .sort((a, b) => b[1].completed - a[1].completed)
                            .slice(0, 5)
                            .map(([addr, stats], i) => (
                              <div key={addr} className="flex items-center gap-3 bg-zinc-900/30 rounded-xl p-3 border border-zinc-800/50">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                                  i === 0 ? 'bg-emerald-500/20 text-emerald-400' :
                                  i === 1 ? 'bg-blue-500/20 text-blue-400' :
                                  i === 2 ? 'bg-amber-500/20 text-amber-400' :
                                  'bg-zinc-800 text-zinc-500'
                                }`}>
                                  #{i + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-mono text-xs truncate">{truncateAddress(addr, 6)}</p>
                                  <p className="text-zinc-500 text-xs">{stats.completed} completed / {stats.total} total</p>
                                </div>
                                <div className="h-2 w-24 bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-500 rounded-full transition-all"
                                    style={{ width: `${stats.total > 0 ? (stats.completed / stats.total * 100) : 0}%` }}
                                  />
                                </div>
                                {addr === wallet.address && <Tag color="emerald">You</Tag>}
                              </div>
                            ));
                        })()}
                      </div>
                    </div>

                    {/* Network Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 text-center">
                        <p className="text-2xl font-display text-emerald-400">
                          {deals.filter(d => d.status === 'Completed').length}
                        </p>
                        <p className="text-zinc-500 text-xs mt-1">Completed</p>
                      </div>
                      <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 text-center">
                        <p className="text-2xl font-display text-blue-400">
                          {deals.filter(d => d.status === 'Active').length}
                        </p>
                        <p className="text-zinc-500 text-xs mt-1">Active</p>
                      </div>
                      <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 text-center">
                        <p className="text-2xl font-display text-amber-400">
                          {formatAmount(deals.reduce((sum, d) => sum + Number(d.totalAmount), 0))}
                        </p>
                        <p className="text-zinc-500 text-xs mt-1">Total Volume</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Award className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">No deals on-chain yet. Deploy a contract to start building reputation.</p>
                  </div>
                )}
              </Card>
            </div>
          ) : null}
        </main>

        {/* Footer */}
        <footer className="relative z-10 border-t border-zinc-800/80 py-6 lg:py-10 bg-[#02040a]/90 backdrop-blur-xl mt-auto mb-16 lg:mb-0">
          <div className="max-w-[90rem] mx-auto px-3 lg:px-6 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10 opacity-80 hover:opacity-100 transition-opacity">
            {/* Left */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <SignalLogo className="w-8 h-8 grayscale opacity-70" />
                <div>
                  <span className="block font-bold text-sm text-white">The Signal Escrow</span>
                  <span className="block text-xs text-zinc-500">Institutional Stablecoin Escrow</span>
                </div>
              </div>
              <p className="text-xs text-zinc-600">
                &copy; {new Date().getFullYear()} The Signal. StableHacks 2026 — Track 3.
              </p>
            </div>

            {/* Middle Links */}
            <div className="flex gap-8 lg:gap-16 justify-center text-sm">
              <div className="flex flex-col gap-3">
                <span className="font-bold text-zinc-400 uppercase tracking-widest text-[10px]">Protocol</span>
                <a href="https://explorer.solana.com/?cluster=devnet" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400 transition-colors flex items-center gap-1">
                  Solana Explorer <ExternalLink size={10} />
                </a>
                <a href="https://solana.com/docs/advanced/token-extensions" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400 transition-colors">
                  Token-2022 Docs
                </a>
              </div>
              <div className="flex flex-col gap-3">
                <span className="font-bold text-zinc-400 uppercase tracking-widest text-[10px]">Ecosystem</span>
                <a href="https://thesignal.directory" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400 transition-colors">
                  The Signal Directory
                </a>
                <a href="https://www.anchor-lang.com" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400 transition-colors">
                  Anchor Framework
                </a>
              </div>
            </div>

            {/* Right Socials */}
            <div className="flex flex-col items-end gap-4 justify-center md:items-end">
              <div className="flex gap-3">
                <a href="https://x.com/thesignaldir" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400 transition-colors p-2 bg-zinc-900 rounded-lg" aria-label="X (Twitter)">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a href="https://www.linkedin.com/company/signaldirectory/" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400 transition-colors p-2 bg-zinc-900 rounded-lg" aria-label="LinkedIn">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
                <a href="https://t.me/thesignaldirectory" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400 transition-colors p-2 bg-zinc-900 rounded-lg" aria-label="Telegram">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </a>
                <a href="https://discord.gg/DyMtfph9rA" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400 transition-colors p-2 bg-zinc-900 rounded-lg" aria-label="Discord">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.105 18.101.12 18.14.143 18.17a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                </a>
              </div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-mono flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Built with Anchor + Token-2022
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile Bottom Tab Bar */}
      {connected && (
        <nav className="fixed bottom-0 left-0 right-0 z-[9999] bg-[#0a0a0a] border-t border-zinc-700 lg:hidden pb-[env(safe-area-inset-bottom,0px)]">
          <div className="flex items-center justify-around h-14">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors relative ${
                  activeTab === tab.id ? 'text-emerald-400' : 'text-zinc-500 active:text-zinc-300'
                }`}
              >
                {activeTab === tab.id && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-400 rounded-full" />
                )}
                <tab.icon size={20} />
                <span className="text-[9px] font-bold uppercase tracking-wider">{tab.mobileLabel}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </ToastContext.Provider>
  );
}
