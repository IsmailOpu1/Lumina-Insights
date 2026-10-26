import { cn } from '@/lib/utils';

interface Props<T extends string> {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** Pill-style switch between a few options (date range, chart granularity). */
export default function Segmented<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            value === o.value
              ? 'bg-secondary text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
