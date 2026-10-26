import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Title row at the top of every app page, with optional buttons on the right. */
export default function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>}
    </div>
  );
}

export interface Stat {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: 'positive' | 'negative' | 'warning';
  hint?: ReactNode;
}

const TONE: Record<NonNullable<Stat['tone']>, string> = {
  positive: 'text-success',
  negative: 'text-destructive',
  warning: 'text-warning',
};

/** A row of small summary numbers shown under a page header. */
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <div className={cn('mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {stats.map(({ label, value, icon: Icon, tone, hint }) => (
        <div key={label} className="surface p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            {Icon && <Icon size={15} className="text-muted-foreground/70" />}
          </div>
          <p className={cn('mt-1.5 truncate text-xl font-semibold tabular-nums', tone ? TONE[tone] : 'text-foreground')}>{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      ))}
    </div>
  );
}
