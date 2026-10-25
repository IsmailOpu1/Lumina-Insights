import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FABProvider, useFAB, useRefreshOnSave } from '@/context/FABContext';
import { inDayFilter, parseDay } from '@/lib/dates';

describe('plain-day dates', () => {
  // 00:30 in Dhaka on 26 Oct is still 25 Oct in UTC: the case that hid new orders.
  const justAfterMidnight = new Date(2026, 9, 26, 0, 30);

  it("shows an order dated today straight away, even just after midnight", () => {
    expect(inDayFilter('2026-10-26', 'today', justAfterMidnight)).toBe(true);
    expect(inDayFilter('2026-10-26', '7days', justAfterMidnight)).toBe(true);
    expect(inDayFilter('2026-10-26', '30days', justAfterMidnight)).toBe(true);
  });

  it('applies the range edges and treats "All Time" as everything', () => {
    expect(inDayFilter('2026-10-25', 'today', justAfterMidnight)).toBe(false);
    expect(inDayFilter('2026-10-19', '7days', justAfterMidnight)).toBe(true);
    expect(inDayFilter('2026-10-18', '7days', justAfterMidnight)).toBe(false);
    expect(inDayFilter('2026-10-27', '30days', justAfterMidnight)).toBe(false);
    expect(inDayFilter('2020-01-01', 'custom', justAfterMidnight)).toBe(true);
  });

  it('reads a plain day as that local day', () => {
    const d = parseDay('2026-10-26');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 26, 0]);
  });
});

describe('refresh after saving from the "+" button', () => {
  function Page({ onRefresh }: { onRefresh: () => void }) {
    useRefreshOnSave('order', onRefresh);
    return null;
  }
  function SaveButtons() {
    const { notifySaved } = useFAB();
    return (
      <>
        <button onClick={() => notifySaved('order')}>save order</button>
        <button onClick={() => notifySaved('expense')}>save expense</button>
      </>
    );
  }

  it('reloads the page only when its kind of record is saved', () => {
    const refresh = vi.fn();
    render(<FABProvider><Page onRefresh={refresh} /><SaveButtons /></FABProvider>);
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('save expense'));
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('save order'));
    fireEvent.click(screen.getByText('save order'));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("doesn't reload on arrival for saves made before the page opened", () => {
    const refresh = vi.fn();
    function App({ showPage }: { showPage: boolean }) {
      return <>{showPage && <Page onRefresh={refresh} />}<SaveButtons /></>;
    }
    const { rerender } = render(<FABProvider><App showPage={false} /></FABProvider>);
    fireEvent.click(screen.getByText('save order'));
    rerender(<FABProvider><App showPage /></FABProvider>);
    expect(refresh).not.toHaveBeenCalled();
  });
});
