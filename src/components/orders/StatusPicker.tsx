import { ChevronDown } from 'lucide-react';
import { ORDER_STATUSES, STATUS_COLORS } from '@/lib/constants';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

interface Props {
  status: string;
  orderNumber: string;
  onChange: (status: string) => void;
  disabled?: boolean;
}

/**
 * An order's status badge that changes the status in one tap. It is a native
 * select under the badge, so phones open their own picker and keyboards and
 * screen readers work as with any select.
 */
export default function StatusPicker({ status, orderNumber, onChange, disabled }: Props) {
  const { t } = useT();
  const color = STATUS_COLORS[status] || '#94A3B8';
  return (
    <span
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-1.5 text-xs font-medium transition focus-within:ring-2 focus-within:ring-ring',
        disabled ? 'opacity-60' : 'hover:brightness-125'
      )}
      style={{ backgroundColor: `${color}14`, borderColor: `${color}33`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {t(status)}
      <ChevronDown size={12} aria-hidden />
      <select
        value={status}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('Status of order {n}', { n: orderNumber })}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-wait"
      >
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>{t(s)}</option>
        ))}
      </select>
    </span>
  );
}
