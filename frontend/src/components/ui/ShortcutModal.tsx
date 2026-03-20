import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { Card } from './Components';

interface ShortcutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['Alt', '1'], desc: 'Go to Compliance' },
  { keys: ['Alt', '2'], desc: 'Go to Deploy Contract' },
  { keys: ['Alt', '3'], desc: 'Go to Deals' },
  { keys: ['Alt', '4'], desc: 'Go to Oracle' },
  { keys: ['?'], desc: 'Toggle this cheat sheet' },
  { keys: ['Esc'], desc: 'Close modal / dialog' },
];

export function ShortcutModal({ isOpen, onClose }: ShortcutModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <Card className="w-full max-w-md p-6 bg-[#02040a] border-zinc-700 shadow-2xl animate-scale-in" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Keyboard size={20} className="text-emerald-400" />
            <h3 className="text-lg font-bold text-white">Keyboard Shortcuts</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
              <span className="text-sm text-zinc-400">{s.desc}</span>
              <div className="flex gap-1.5">
                {s.keys.map((k) => (
                  <kbd key={k} className="px-2 py-1 text-[11px] font-mono font-bold text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-md shadow-sm">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-zinc-600 mt-4 text-center uppercase tracking-widest">
          Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 border border-zinc-700">?</kbd> anywhere to toggle
        </p>
      </Card>
    </div>
  );
}
