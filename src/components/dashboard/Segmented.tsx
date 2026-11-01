import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

interface Props<T extends string> {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** Pill-style switch between a few options (date range, chart granularity). */
export default function Segmented<T extends string>({ options, value, onChange, label }: Props<T>) {
  const { t } = useT();
  return (
    <div role="group" aria-label={t(label)} className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'rounded-md px-3 py-1 text-xs max-sm:px-2.5 font-medium transition-colors',
            value === o.value
              ? 'bg-secondary text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t(o.label)}
        </button>
      ))}
    </div>
  );
}
