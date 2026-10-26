import { cn } from '@/lib/utils';

/**
 * Soft mint and teal light drifting behind a page. Place it inside a
 * `relative` container; it never takes clicks.
 */
export default function GlowBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden', className)}>
      <div className="orb -left-24 -top-24 h-[420px] w-[420px] bg-primary/25" />
      <div className="orb right-[-120px] top-40 h-[360px] w-[360px] bg-highlight/20 [animation-delay:-8s]" />
      <div className="orb bottom-[-140px] left-1/3 h-[380px] w-[380px] bg-primary/15 [animation-delay:-15s]" />
    </div>
  );
}
