import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AIAssistant from '@/pages/AIAssistant';
import InvitePage from '@/pages/InvitePage';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  currency: 'BDT',
}));

// A chainable query builder that resolves to an empty result.
function emptyQuery() {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'insert']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return q;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => emptyQuery(),
    functions: { invoke: mocks.invoke },
  },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ ownerIdForQueries: 'owner-1', workspace: { currency: mocks.currency } }),
}));

const snapshot = {
  period: { from: '2026-09-26', to: '2026-10-25' },
  business: { name: 'Rahman Fashion', type: 'Fashion/Clothing', description: '', currency: 'BDT' },
  revenue: 125000,
  net_profit: 31250.4,
  margin_pct: 25,
  orders: 42,
  cancelled_orders: 3,
  expenses: 9000,
  ad_spend: 12000,
  roas: 10.42,
  top_products: [{ name: 'Panjabi', units: 30, revenue: 90000, profit: 25000 }],
  sales_by_channel: [
    { channel: 'Facebook', orders: 30, revenue: 100000 },
    { channel: 'Instagram', orders: 12, revenue: 25000 },
  ],
  low_stock: [{ name: 'Saree', stock: 2, threshold: 5 }],
  inventory: { products: 8, value: 50000 },
  daily: [],
};

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
  mocks.currency = 'BDT';
});

describe('AI assistant', () => {
  beforeEach(() => {
    mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
    mocks.invoke.mockResolvedValue({ data: { response: 'Sales look strong.' }, error: null });
  });

  it('shows the same numbers business_snapshot returns, for the last 30 days', async () => {
    render(<AIAssistant />);
    expect(await screen.findByText('📊 Last 30 days')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('business_snapshot', expect.objectContaining({ p_from: expect.any(String) }));
    expect(screen.getByText('৳1,25,000')).toBeInTheDocument();
    expect(screen.getByText('৳31,250')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('Panjabi (30 units)')).toBeInTheDocument();
    expect(screen.getByText('Facebook (80%)')).toBeInTheDocument();
    expect(screen.getByText('1 items')).toBeInTheDocument();
  });

  it('uses the workspace currency', async () => {
    mocks.currency = 'USD';
    render(<AIAssistant />);
    expect(await screen.findByText('$125,000')).toBeInTheDocument();
  });

  it('sends only the message and history, never business numbers', async () => {
    render(<AIAssistant />);
    await screen.findByText('📊 Last 30 days');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'How was my week?' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fn, { body }] = mocks.invoke.mock.calls[0];
    expect(fn).toBe('business-ai-chat');
    expect(body.message).toBe('How was my week?');
    expect(body).not.toHaveProperty('business_context');
    expect(await screen.findByText('Sales look strong.')).toBeInTheDocument();
  });
});

describe('Invite page', () => {
  function openInvite() {
    render(
      <MemoryRouter initialEntries={['/invite/tok-123']}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('shows the business, role and invited email for a valid token', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ role: 'manager', email: 'karim@example.com', business_name: 'Rahman Fashion', status: 'valid' }],
      error: null,
    });
    openInvite();
    expect(await screen.findByText('Rahman Fashion')).toBeInTheDocument();
    expect(screen.getByText('manager')).toBeInTheDocument();
    expect(screen.getByText('karim@example.com')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('get_invite_preview', { p_token: 'tok-123' });
  });

  it.each(['used', 'expired'])('shows "Invite Expired" for a %s invite', async (status) => {
    mocks.rpc.mockResolvedValue({
      data: [{ role: 'viewer', email: 'x@example.com', business_name: 'Rahman Fashion', status }],
      error: null,
    });
    openInvite();
    expect(await screen.findByText('Invite Expired')).toBeInTheDocument();
  });

  it('shows "Invite Expired" for an unknown token', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    openInvite();
    expect(await screen.findByText('Invite Expired')).toBeInTheDocument();
  });
});
