import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { NotificationProvider, useNotifications } from '@/context/NotificationContext';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  tables: [] as string[],
  writes: [] as string[],
  onInsert: null as null | ((payload: { new: unknown }) => void),
}));

const rows = [
  { id: 'n1', type: 'new_order', title: 'New Order Received', message: 'ORD-001', is_read: false, created_at: '2026-10-25T10:00:00Z' },
  { id: 'n2', type: 'low_stock', title: 'Low Stock Alert', message: 'Saree', is_read: true, created_at: '2026-10-25T09:00:00Z' },
];

function query(table: string) {
  mocks.tables.push(table);
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q;
  for (const m of ['update', 'delete', 'insert']) q[m] = () => { mocks.writes.push(`${m} ${table}`); return q; };
  q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, count: 1, error: null });
  return q;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: query,
    channel: () => {
      const ch = {
        on: (_e: string, _f: unknown, cb: (payload: { new: unknown }) => void) => { mocks.onInsert = cb; return ch; },
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'viewer-1' }, ownerIdForQueries: 'owner-1' }),
}));
vi.mock('sonner', () => ({ toast: vi.fn() }));

let api: ReturnType<typeof useNotifications>;
function Probe() {
  api = useNotifications();
  return <p>unread:{api.unreadCount} shown:{api.notifications.map((n) => `${n.id}${n.is_read ? '(read)' : ''}`).join(',')}</p>;
}

async function mount() {
  render(<NotificationProvider><Probe /></NotificationProvider>);
  await screen.findByText(/shown:n1,n2\(read\)/);
}

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.tables = [];
  mocks.writes = [];
});

describe('per-user notifications', () => {
  it('reads from my_notifications, never the shared table', async () => {
    await mount();
    expect(screen.getByText(/unread:1/)).toBeInTheDocument();
    expect(new Set(mocks.tables)).toEqual(new Set(['my_notifications']));
  });

  it('marking read goes through the per-user RPC', async () => {
    await mount();
    await act(() => api.markOneRead('n1'));
    expect(mocks.rpc).toHaveBeenCalledWith('mark_notifications_read', { p_ids: ['n1'] });
    expect(screen.getByText(/unread:0 shown:n1\(read\),n2\(read\)/)).toBeInTheDocument();

    await act(() => api.markAllRead());
    expect(mocks.rpc).toHaveBeenCalledWith('mark_notifications_read', {});
  });

  it('clearing only dismisses for this user', async () => {
    await mount();
    await act(() => api.dismiss(['n2']));
    expect(mocks.rpc).toHaveBeenCalledWith('dismiss_notifications', { p_ids: ['n2'] });
    expect(screen.getByText(/shown:n1$/)).toBeInTheDocument();

    await act(() => api.dismiss());
    expect(mocks.rpc).toHaveBeenCalledWith('dismiss_notifications', {});
    expect(mocks.writes).toEqual([]); // nothing updated or deleted in the shared table
  });

  it('a live notification arrives unread', async () => {
    await mount();
    act(() => mocks.onInsert!({ new: { id: 'n3', type: 'new_order', title: 'New Order', message: 'ORD-002', created_at: '' } }));
    await waitFor(() => expect(screen.getByText(/unread:2 shown:n3,n1/)).toBeInTheDocument());
  });
});
