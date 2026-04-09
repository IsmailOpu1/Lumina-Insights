import { STATUS_COLORS } from '@/lib/constants';

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] || '#6B7280';

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-extrabold text-[#269726] bg-[#c5b4b4]/45"
      style={{
        backgroundColor: `${color}20`,
        color: color
      }}>
      
      {status}
    </span>);

}