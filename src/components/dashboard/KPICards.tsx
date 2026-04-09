import { useEffect, useRef, useState } from 'react';
import { formatTaka } from '@/lib/constants';
import SkeletonLoader from '@/components/SkeletonLoader';

interface KPI {
  label: string;
  value: number;
  format: 'taka' | 'number' | 'percent' | 'name' | 'roas';
  color?: string;
  subValue?: string;
  nameValue?: string;
  tooltip?: string;
}

interface KPICardsProps {
  kpis: KPI[];
  loading: boolean;
}

function AnimatedNumber({ value, format, color }: {value: number;format: KPI['format'];color?: string;}) {
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number>();
  const startRef = useRef<number>();

  useEffect(() => {
    startRef.current = performance.now();
    const target = value;
    const duration = 800;

    const animate = (now: number) => {
      const elapsed = now - (startRef.current || now);
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(target * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {if (rafRef.current) cancelAnimationFrame(rafRef.current);};
  }, [value]);

  const formatted = format === 'taka' ? formatTaka(displayed) :
  format === 'percent' ? `${displayed.toFixed(1)}%` :
  format === 'roas' ? `${displayed.toFixed(1)}x` :
  Math.round(displayed).toLocaleString();

  return (
    <span className="kpi-number text-[32px] font-bold leading-tight" style={{ color: color || 'hsl(145, 27%, 39%)' }}>
      {formatted}
    </span>);

}

export default function KPICards({ kpis, loading }: KPICardsProps) {
  if (loading) return <SkeletonLoader variant="card" count={10} />;

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((kpi, i) =>
      <div
        key={i}
        className="group kpi-hover rounded-xl border p-5 shadow-[0_2px_8px_rgba(74,124,89,0.12)] cursor-pointer border-[var(--card-bg)] bg-[var(--card-bg)]"
        title={kpi.tooltip}>
        
          {kpi.format === 'name' ?
        <>
              <p className="truncate text-base font-bold text-primary" title={kpi.nameValue}>
                {kpi.nameValue ? kpi.nameValue.length > 16 ? kpi.nameValue.slice(0, 16) + '…' : kpi.nameValue : '—'}
              </p>
              {kpi.subValue &&
          <p className="mt-1 text-sm text-accent font-extrabold">{kpi.subValue}</p>
          }
            </> :
        kpi.format === 'roas' && kpi.value === Infinity ?
        <span className="kpi-number text-[32px] font-bold leading-tight" style={{ color: kpi.color || 'hsl(145, 27%, 39%)' }}>∞</span> :

        <AnimatedNumber value={kpi.value} format={kpi.format} color={kpi.color} />
        }
          <p className="mt-1 font-extrabold text-sm text-accent">{kpi.label}</p>
        </div>
      )}
    </div>);

}