import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rich, useT } from '@/i18n';

interface PagerProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

/** "Showing 21–40 of 132" with previous/next and nearby page numbers. */
export default function Pager({ page, totalPages, total, pageSize, onChange }: PagerProps) {
  const { t } = useT();
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => Math.abs(p - page) <= 1 || p === 1 || p === totalPages);

  const btn = 'flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">
        {rich(t('Showing {range} of {total}'), {
          range: <span className="tabular-nums text-foreground">{from}–{to}</span>,
          total: <span className="tabular-nums text-foreground">{total}</span>,
        })}
      </p>
      {totalPages > 1 && (
        <nav aria-label={t('Pages')} className="flex items-center gap-1">
          <button aria-label={t('Previous page')} className={cn(btn, 'text-muted-foreground hover:bg-secondary hover:text-foreground')} disabled={page <= 1} onClick={() => onChange(page - 1)}>
            <ChevronLeft size={15} />
          </button>
          {pages.map((p, i) => (
            <span key={p} className="flex items-center">
              {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-xs text-muted-foreground">…</span>}
              <button
                aria-current={p === page ? 'page' : undefined}
                className={cn(btn, p === page ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}
                onClick={() => onChange(p)}
              >
                {p}
              </button>
            </span>
          ))}
          <button aria-label={t('Next page')} className={cn(btn, 'text-muted-foreground hover:bg-secondary hover:text-foreground')} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
            <ChevronRight size={15} />
          </button>
        </nav>
      )}
    </div>
  );
}
