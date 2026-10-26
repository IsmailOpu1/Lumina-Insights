import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import SkeletonLoader from '@/components/SkeletonLoader';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';

export type KPITone = 'positive' | 'negative' | 'warning';

export interface KPI {
  label: string;
  value: number;
  format: 'taka' | 'number' | 'percent' | 'name' | 'roas';
  icon: LucideIcon;
  tone?: KPITone;
  subValue?: string;
  nameValue?: string;
  tooltip?: string;
}

interface KPICardsProps {
  /** Headline numbers, shown large. The first one is highlighted. */
  primary: KPI[];
  /** Supporting numbers, shown as compact tiles. */
  secondary: KPI[];
  loading: boolean;
}

const TONE_TEXT: Record<KPITone, string> = {
  positive: 'text-success',
  negative: 'text-destructive',
  warning: 'text-warning',
};

function AnimatedNumber({ value, format }: { value: number; format: KPI['format'] }) {
  const { formatCurrency } = useCurrency();
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = performance.now();
    const duration = 700;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setDisplayed(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  if (format === 'roas' && value === Infinity) return <>∞</>;
  return (
    <>
      {format === 'taka' ? formatCurrency(displayed)
        : format === 'percent' ? `${displayed.toFixed(1)}%`
        : format === 'roas' ? `${displayed.toFixed(1)}x`
        : Math.round(displayed).toLocaleString()}
    </>
  );
}

function KPIValue({ kpi }: { kpi: KPI }) {
  if (kpi.format === 'name') {
    return <span className="block truncate" title={kpi.nameValue}>{kpi.nameValue || '—'}</span>;
  }
  return <AnimatedNumber value={kpi.value} format={kpi.format} />;
}

export default function KPICards({ primary, secondary, loading }: KPICardsProps) {
  if (loading) return <div className="mb-6"><SkeletonLoader variant="card" count={4} /></div>;

  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {primary.map((kpi, i) => {
          const Icon = kpi.icon;
          const featured = i === 0;
          return (
            <div
              key={kpi.label}
              title={kpi.tooltip}
              className={cn(
                'surface-interactive relative overflow-hidden p-5',
                featured && 'border-primary/30 shadow-glow'
              )}
            >
              {featured && (
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
              )}
              <div className="mb-4 flex items-center justify-between">
                <span className="eyebrow">{kpi.label}</span>
                <span className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg',
                  featured ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
                )}>
                  <Icon size={16} />
                </span>
              </div>
              <p className={cn(
                'kpi-number text-[28px] font-semibold leading-none tracking-tight tabular-nums',
                kpi.tone ? TONE_TEXT[kpi.tone] : 'text-foreground'
              )}>
                <KPIValue kpi={kpi} />
              </p>
              {kpi.subValue && <p className="mt-2 text-xs text-muted-foreground">{kpi.subValue}</p>}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {secondary.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} title={kpi.tooltip} className="surface-interactive px-4 py-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground">
                <Icon size={13} />
                <span className="truncate text-xs">{kpi.label}</span>
              </div>
              <p className={cn(
                'truncate text-lg font-semibold tabular-nums',
                kpi.tone ? TONE_TEXT[kpi.tone] : 'text-foreground'
              )}>
                <KPIValue kpi={kpi} />
              </p>
              {kpi.subValue && <p className="truncate text-xs text-muted-foreground">{kpi.subValue}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
