import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { clickableProps } from '@/lib/clickable';

function Card({ open, inner }: { open: () => void; inner: () => void }) {
  return (
    <div {...clickableProps(open)}>
      Note title
      <button type="button" onClick={inner}>Delete</button>
    </div>
  );
}

describe('clickable cards', () => {
  it('can be reached with Tab and opened with Enter or Space', () => {
    const open = vi.fn();
    render(<Card open={open} inner={vi.fn()} />);
    const card = screen.getByRole('button', { name: /Note title/ });
    expect(card).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    fireEvent.keyDown(card, { key: 'a' });
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('leaves keys on a button inside the card to that button', () => {
    const open = vi.fn();
    render(<Card open={open} inner={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Delete' }), { key: 'Enter' });
    expect(open).not.toHaveBeenCalled();
  });
});
