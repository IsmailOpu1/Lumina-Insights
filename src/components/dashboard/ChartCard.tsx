import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** The card every dashboard panel sits in: title row, optional action, content. */
export default function ChartCard({ title, subtitle, action, className, children }: Props) {
  return (
    <section className={cn('surface p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Colored dot + label + value, used under donut charts. */
export function LegendItem({ color, label, value }: { color: string; label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{label}</span>
      </span>
      {value && <span className="tabular-nums font-medium text-foreground">{value}</span>}
    </div>
  );
}
