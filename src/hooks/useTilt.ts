import { useEffect, useRef } from 'react';

interface TiltOptions {
  /** Largest rotation in degrees at the element's edges. */
  max?: number;
  /** Track the pointer anywhere on the page instead of only over the element. */
  global?: boolean;
}

/**
 * Tilts an element in 3D towards the pointer and exposes the pointer
 * position as CSS variables for glare and parallax:
 *   --rx, --ry  rotation in degrees
 *   --px, --py  pointer position across the element, 0% to 100%
 *   --mx, --my  pointer offset from the centre, -1 to 1
 * Writes styles directly (no re-renders) and stays still for people who
 * prefer reduced motion or are on a touch screen.
 */
export function useTilt<T extends HTMLElement>({ max = 8, global = false }: TiltOptions = {}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia?.('(pointer: fine)').matches;
    if (reduced || !finePointer) return;

    let frame = 0;
    const set = (mx: number, my: number) => {
      el.style.setProperty('--rx', `${(-my * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(mx * max).toFixed(2)}deg`);
      el.style.setProperty('--mx', mx.toFixed(3));
      el.style.setProperty('--my', my.toFixed(3));
      el.style.setProperty('--px', `${((mx + 1) * 50).toFixed(1)}%`);
      el.style.setProperty('--py', `${((my + 1) * 50).toFixed(1)}%`);
    };

    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        set(
          clamp(((e.clientX - r.left) / r.width) * 2 - 1),
          clamp(((e.clientY - r.top) / r.height) * 2 - 1),
        );
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      set(0, 0);
    };

    const target: HTMLElement | Window = global ? window : el;
    target.addEventListener('pointermove', onMove as EventListener);
    (global ? document.documentElement : el).addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('pointermove', onMove as EventListener);
      (global ? document.documentElement : el).removeEventListener('pointerleave', onLeave);
    };
  }, [max, global]);

  return ref;
}
