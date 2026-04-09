import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon: Icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-muted p-4">
        <Icon size={48} className="text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-base font-bold text-foreground">{title}</h3>
      <p className="mb-6 max-w-xs text-sm text-muted-foreground">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.97]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
