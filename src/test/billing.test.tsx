import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Billing from '@/pages/Billing';
import Landing from '@/pages/Landing';
import SubscriptionBanner from '@/components/SubscriptionBanner';
import ProtectedRoute from '@/components/ProtectedRoute';
import FAB from '@/components/FAB';
import { FABProvider } from '@/context/FABContext';
import { daysUntil, isOpenEnded, paymentStatusLabel, planLabel, proIsRunning, type Subscription } from '@/lib/subscription';
import { dbErrorMessage, functionErrorMessage } from '@/lib/dbErrors';

const plans = [
  { id: 'starter', name: 'Starter', monthly_price: 499, yearly_price: 4990, max_orders_per_month: 300, max_team_members: 0,
    ai_chat_per_day: 20, insights_per_day: 10, marketing_per_month: 30, weekly_summary: false, data_export: false, sort_order: 1 },
  { id: 'pro', name: 'Pro', monthly_price: 1499, yearly_price: 14990, max_orders_per_month: null, max_team_members: 5,
    ai_chat_per_day: 100, insights_per_day: 30, marketing_per_month: null, weekly_summary: true, data_export: true, sort_order: 2 },
];

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  refresh: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  sub: null as unknown,
  canWrite: true,
  auth: { session: null as unknown, userSettings: null as unknown, loading: false, isViewer: false },
}));

function query(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit', 'eq']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  return q;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => query(table === 'plans' ? plans : [
      { id: 'pay1', created_at: '2026-10-01T10:00:00Z', plan: 'pro', billing_period: 'monthly', amount: 1499, card_type: 'BKASH-BKash', status: 'paid' },
    ]),
    functions: { invoke: mocks.invoke },
  },
}));
vi.mock('@/context/SubscriptionContext', () => ({
  useSubscription: () => ({ subscription: mocks.sub, loading: false, refresh: mocks.refresh, canWrite: mocks.canWrite, features: { dataExport: true, weeklySummary: true } }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('sonner', () => ({ toast: mocks.toast }));

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    plan: 'starter',
    state: 'active',
    billing_period: 'monthly',
    trial_ends_at: null,
    current_period_end: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    is_owner: true,
    limits: plans[0],
    usage: { orders_this_month: 280, team_members: 0, ai_chat_today: 5, insights_today: 0, marketing_this_month: 12 },
    ...overrides,
  } as Subscription;
}

function renderAt(path: string, ui: React.ReactNode) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={ui} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.refresh.mockReset();
  mocks.toast.mockReset(); mocks.toast.success.mockReset(); mocks.toast.error.mockReset();
  mocks.sub = sub();
  mocks.canWrite = true;
  mocks.auth = { session: null, userSettings: null, loading: false, isViewer: false };
});

describe('subscription helpers', () => {
  it('counts whole days left and never goes negative', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(daysUntil('2026-10-28T11:00:00Z', now)).toBe(2);
    expect(daysUntil('2026-10-20T00:00:00Z', now)).toBe(0);
  });

  it('labels plans and recognises open-ended founder access', () => {
    expect(planLabel(sub({ state: 'trialing' }))).toBe('Pro trial');
    expect(planLabel(sub({ plan: 'pro' }))).toBe('Pro');
    expect(isOpenEnded(sub({ current_period_end: '2100-01-01T00:00:00Z' }))).toBe(true);
    expect(isOpenEnded(sub())).toBe(false);
  });

  it('shows abandoned checkouts as not completed instead of pending forever', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(paymentStatusLabel('pending', '2026-10-26T11:30:00Z', now)).toBe('Pending');
    expect(paymentStatusLabel('pending', '2026-10-26T09:00:00Z', now)).toBe('Not completed');
    expect(paymentStatusLabel('review', '2026-10-26T09:00:00Z', now)).toBe('Under review');
    expect(paymentStatusLabel('paid', '2026-10-01T09:00:00Z', now)).toBe('Paid');
  });

  it('knows when a paid Pro period is running', () => {
    expect(proIsRunning(sub({ plan: 'pro' }))).toBe(true);
    expect(proIsRunning(sub({ plan: 'pro', state: 'trialing' }))).toBe(false);
    expect(proIsRunning(sub({ plan: 'pro', state: 'expired' }))).toBe(false);
    expect(proIsRunning(sub())).toBe(false);
  });

  it('explains plan limits and reads edge function errors', async () => {
    expect(dbErrorMessage('plan_limit_orders')).toMatch(/monthly order limit/);
    expect(dbErrorMessage('subscription_inactive')).toMatch(/read-only/);
    const error = { context: new Response(JSON.stringify({ error: "You've used today's AI assistant questions" }), { status: 429 }) };
    expect(await functionErrorMessage(error, 'fallback')).toBe("You've used today's AI assistant questions");
    expect(await functionErrorMessage(new Error('x'), 'fallback')).toBe('fallback');
  });
});

describe('Billing page', () => {
  it('shows the plan, usage against limits and both plans', async () => {
    renderAt('/billing', <Billing />);
    expect(screen.getByText('Starter', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('280 / 300')).toBeInTheDocument();
    expect(screen.getByText('12 / 30')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Pay ৳1,499' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renew Starter' })).toBeInTheDocument();
    expect(await screen.findByText('BKASH-BKash')).toBeInTheDocument();
  });

  it('starts an SSLCommerz checkout for the chosen plan and period', async () => {
    mocks.invoke.mockResolvedValue({ data: { url: 'https://sandbox.sslcommerz.com/gw/abc' }, error: null });
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, set href(v: string) { assign(v); } } });

    renderAt('/billing', <Billing />);
    fireEvent.click(screen.getByRole('button', { name: /yearly/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pay ৳14,990' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://sandbox.sslcommerz.com/gw/abc'));
    expect(mocks.invoke).toHaveBeenCalledWith('create-payment', { body: { plan: 'pro', billing_period: 'yearly' } });
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('team members see the plan but cannot pay', async () => {
    mocks.sub = sub({ is_owner: false });
    renderAt('/billing', <Billing />);
    expect(screen.getByText(/Only the workspace owner/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });

  it('reports the payment result after returning from SSLCommerz', async () => {
    renderAt('/billing?payment=success', <Billing />);
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/plan is active/)));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('does not let a Pro customer buy Starter while Pro is still running', async () => {
    mocks.sub = sub({ plan: 'pro', limits: plans[1] });
    renderAt('/billing', <Billing />);
    expect(await screen.findByRole('button', { name: 'Renew Pro' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Pay ৳499' })).not.toBeInTheDocument();
    expect(screen.getByText('Included in your Pro plan')).toBeInTheDocument();
    expect(screen.getByText(/switch to Starter after/)).toBeInTheDocument();
  });

  it('tells a Pro account with no end date that it never needs Starter', async () => {
    mocks.sub = sub({ plan: 'pro', limits: plans[1], current_period_end: '2100-01-01T00:00:00Z' });
    renderAt('/billing', <Billing />);
    expect(await screen.findByText(/Pro with no end date/)).toBeInTheDocument();
  });

  it('marks an expired plan as read-only', () => {
    mocks.sub = sub({ state: 'expired' });
    renderAt('/billing', <Billing />);
    expect(screen.getByText(/workspace is read-only/)).toBeInTheDocument();
  });
});

describe('SubscriptionBanner', () => {
  it('warns owners in the last days of the trial', () => {
    mocks.sub = sub({ state: 'trialing', trial_ends_at: new Date(Date.now() + 2 * 86_400_000).toISOString() });
    renderAt('/', <SubscriptionBanner />);
    expect(screen.getByText(/trial ends in 2 days/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a plan' })).toHaveAttribute('href', '/billing');
  });

  it('stays quiet early in the trial', () => {
    mocks.sub = sub({ state: 'trialing', trial_ends_at: new Date(Date.now() + 10 * 86_400_000).toISOString() });
    renderAt('/', <SubscriptionBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('tells members of an expired workspace to ask the owner', () => {
    mocks.sub = sub({ state: 'expired', is_owner: false });
    renderAt('/', <SubscriptionBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(/read-only.*Ask the workspace owner/);
  });

  it('tells members their access is paused while the workspace is not on Pro', () => {
    mocks.sub = sub({ is_owner: false, member_access_suspended: true });
    renderAt('/', <SubscriptionBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Team access is a Pro feature.*upgrade to Pro/);
  });
});

describe('Add button (FAB)', () => {
  const renderFAB = () => renderAt('/orders', <FABProvider><FAB /></FABProvider>);

  it('is shown while the workspace can be edited', () => {
    renderFAB();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('is hidden when the workspace is read-only', () => {
    mocks.canWrite = false;
    renderFAB();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is hidden for viewers', () => {
    mocks.auth = { ...mocks.auth, isViewer: true };
    renderFAB();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('Landing page', () => {
  it('shows prices from the plans table and switches to yearly', async () => {
    renderAt('/', <Landing />);
    expect(await screen.findByText('৳1,499')).toBeInTheDocument();
    expect(screen.getByText('৳499')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /yearly/i }));
    expect(screen.getByText('৳14,990')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /free trial/i })[0]).toHaveAttribute('href', '/signup');
  });

  it('is shown at "/" to signed-out visitors, while other pages still need login', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ProtectedRoute publicHome={<p>Landing page</p>}><p>Dashboard</p></ProtectedRoute>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Landing page')).toBeInTheDocument();
  });

  it('signed-in users still get the dashboard at "/"', () => {
    mocks.auth = { session: {}, userSettings: { onboarding_complete: true }, loading: false, isViewer: false };
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ProtectedRoute publicHome={<p>Landing page</p>}><p>Dashboard</p></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
