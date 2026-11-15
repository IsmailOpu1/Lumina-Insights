import type { KeyboardEvent } from 'react';

/**
 * Props that let a clickable card (one that holds its own buttons, so it can't be a <button>)
 * be reached with Tab and opened with Enter or Space, like a button.
 */
export function clickableProps(open: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      // Keys pressed on a button inside the card belong to that button.
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    },
  };
}

/** The focus ring for those cards, matching the app's buttons. */
export const clickableFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';
