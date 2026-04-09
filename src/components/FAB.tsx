import { useState, useRef, useEffect } from 'react';
import { Plus, ShoppingBag, Receipt, Package, X } from 'lucide-react';
import { useFAB } from '@/context/FABContext';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'react-router-dom';

const FAB_OPTIONS = [
  { type: 'order' as const, label: 'Add Order', icon: ShoppingBag, bg: '#4A7C59' },
  { type: 'expense' as const, label: 'Add Expense', icon: Receipt, bg: '#F59E0B' },
  { type: 'product' as const, label: 'Add Product', icon: Package, bg: '#3B82F6' },
];

const hideFABRoutes = ['/ai-assistant', '/notes', '/settings', '/notifications'];

export default function FAB() {
  const [expanded, setExpanded] = useState(false);
  const { openModal } = useFAB();
  const { isViewer } = useAuth();
  const fabRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    if (expanded) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expanded]);

  if (hideFABRoutes.includes(pathname) || isViewer) return null;

  return (
    <div ref={fabRef} className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-3" style={{ bottom: 'max(24px, env(safe-area-inset-bottom, 24px))' }}>
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex h-14 w-14 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95 text-amber-500 shadow-lg opacity-100 bg-rose-950 hover:bg-rose-800">
        <span className={`transition-transform duration-200 ${expanded ? 'rotate-45' : ''}`}>
          {expanded ? <X size={24} strokeWidth={2.5} className="text-amber-500 bg-rose-800" /> : <Plus size={24} strokeWidth={2.5} />}
        </span>
      </button>

      {expanded &&
        FAB_OPTIONS.slice().reverse().map((opt, i) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.type}
              onClick={() => {
                setExpanded(false);
                openModal(opt.type);
              }}
              className="flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-95 animate-in slide-in-from-bottom-2 fade-in"
              style={{
                backgroundColor: opt.bg,
                animationDelay: `${i * 50}ms`,
                animationFillMode: 'backwards',
              }}>
              <Icon size={18} />
              <span>{opt.label}</span>
            </button>
          );
        })}
    </div>
  );
}
