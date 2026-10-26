import { STATUS_COLORS } from '@/lib/constants';

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] || '#94A3B8';

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}14`, borderColor: `${color}33`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}
