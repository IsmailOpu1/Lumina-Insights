import { useState, useRef, useEffect } from 'react';
import { Plus, ShoppingBag, Receipt, Package } from 'lucide-react';
import { useFAB } from '@/context/FABContext';
import { useReadOnly } from '@/hooks/useReadOnly';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const FAB_OPTIONS = [
  { type: 'order' as const, label: 'Add order', icon: ShoppingBag },
  { type: 'expense' as const, label: 'Add expense', icon: Receipt },
  { type: 'product' as const, label: 'Add product', icon: Package },
];

const hideFABRoutes = ['/ai-assistant', '/notes', '/settings', '/notifications'];

export default function FAB() {
  const [expanded, setExpanded] = useState(false);
  const { openModal } = useFAB();
  const readOnly = useReadOnly();
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

  if (hideFABRoutes.includes(pathname) || readOnly) return null;

  return (
    <div ref={fabRef} className="fixed right-6 z-50 flex flex-col-reverse items-end gap-2" style={{ bottom: 'max(24px, env(safe-area-inset-bottom, 24px))' }}>
      <button
        onClick={() => setExpanded((p) => !p)}
        aria-label={expanded ? 'Close quick add' : 'Quick add'}
        aria-expanded={expanded}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow transition-all duration-200 hover:scale-105 hover:brightness-110 active:scale-95"
      >
        <Plus size={24} strokeWidth={2.5} className={cn('transition-transform duration-200', expanded && 'rotate-45')} />
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
              className="flex items-center gap-2.5 rounded-full border border-border bg-popover/95 py-2 pl-3 pr-4 text-sm font-medium text-foreground shadow-xl shadow-black/40 backdrop-blur transition-colors hover:border-primary/40 hover:bg-secondary animate-in slide-in-from-bottom-2 fade-in"
              style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Icon size={15} />
              </span>
              {opt.label}
            </button>
          );
        })}
    </div>
  );
}
