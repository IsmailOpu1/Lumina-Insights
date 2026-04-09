interface SkeletonLoaderProps {
  variant: 'card' | 'row' | 'chart';
  count?: number;
}

export default function SkeletonLoader({ variant, count = 1 }: SkeletonLoaderProps) {
  const items = Array.from({ length: count });

  if (variant === 'card') {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl bg-muted p-5">
            <div className="mb-3 h-3 w-20 rounded bg-muted-foreground/20" />
            <div className="h-7 w-28 rounded bg-muted-foreground/20" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'row') {
    return (
      <div className="space-y-3">
        {items.map((_, i) => (
          <div key={i} className="flex animate-pulse items-center gap-4 rounded bg-muted p-3">
            <div className="h-4 w-4 rounded bg-muted-foreground/20" />
            <div className="h-4 flex-1 rounded bg-muted-foreground/20" />
            <div className="h-4 w-20 rounded bg-muted-foreground/20" />
          </div>
        ))}
      </div>
    );
  }

  // chart
  return (
    <div className="animate-pulse rounded-xl bg-muted p-5">
      <div className="mb-4 h-4 w-32 rounded bg-muted-foreground/20" />
      <div className="h-48 rounded bg-muted-foreground/20" />
    </div>
  );
}
