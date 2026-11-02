import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import WeeklySummary from '@/components/dashboard/WeeklySummary';

const mocks = vi.hoisted(() => ({
  pro: true,
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/context/SubscriptionContext', () => ({ useSubscription: () => ({ features: { weeklySummary: mocks.pro } }) }));

beforeEach(() => {
  mocks.pro = true;
  mocks.invoke.mockReset();
});

describe('Your week', () => {
  it("shows last week's summary with its dates, asking in the app's language", async () => {
    mocks.invoke.mockResolvedValue({
      data: { summary: 'Revenue rose to ৳42,000 last week. Restock the Jamdani Saree.', from: '2026-10-26', to: '2026-11-01' },
      error: null,
    });
    render(<WeeklySummary />);
    expect(screen.getByText('Writing your weekly summary…')).toBeInTheDocument();
    expect(await screen.findByText('Revenue rose to ৳42,000 last week. Restock the Jamdani Saree.')).toBeInTheDocument();
    expect(screen.getByText('26 Oct – 1 Nov')).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith('weekly-summary', { body: { language: 'en' } });
  });

  it('hides itself on a quiet week or an error', async () => {
    mocks.invoke.mockResolvedValue({ data: { summary: null, reason: 'quiet' }, error: null });
    const { container } = render(<WeeklySummary />);
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('is not shown or fetched without Pro', () => {
    mocks.pro = false;
    const { container } = render(<WeeklySummary />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
