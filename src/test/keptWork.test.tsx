import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createKeptStore, clearKeptWork } from '@/lib/keptWork';
import AIAssistant from '@/pages/AIAssistant';
import AddOrderModal from '@/components/AddOrderModal';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: (table: string) => {
      if (table === 'inventory') {
        return {
          select: () => ({
            order: () => Promise.resolve({
              data: [{ id: 'p1', product_name: 'Panjabi', selling_price: 1200, cost_price: 500, stock_quantity: 7, low_stock_threshold: 5 }],
              error: null,
            }),
          }),
        };
      }
      return {
        insert: (row: unknown) => { mocks.insert(row); return Promise.resolve({ error: null }); },
        select: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [{ order_number: 'ORD-007' }] }) }),
          eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], count: 0 }) }) }),
        }),
      };
    },
  },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, ownerIdForQueries: 'owner-1', workspace: { currency: 'BDT' } }),
}));
vi.mock('@/context/FABContext', () => ({
  useFAB: () => ({ activeModal: null, closeModal: vi.fn() }),
}));
vi.mock('@/lib/businessSnapshot', () => ({ fetchRecentSnapshot: () => Promise.resolve(null) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  clearKeptWork();
  localStorage.clear();
});

describe('kept work store', () => {
  it('saves per user, reloads it, and forgets it on sign-out', () => {
    const a = createKeptStore('test-a', () => ({ text: '' }));
    a.load('user-1');
    a.setter()({ text: 'half typed' });

    // A page reload is a fresh copy of the store reading the same storage.
    const reloaded = createKeptStore('test-a', () => ({ text: '' }));
    reloaded.load('user-1');
    expect(reloaded.get().text).toBe('half typed');

    // Another user on the same browser sees nothing of it.
    reloaded.load('user-2');
    expect(reloaded.get().text).toBe('');

    clearKeptWork();
    const afterSignOut = createKeptStore('test-a', () => ({ text: '' }));
    afterSignOut.load('user-1');
    expect(afterSignOut.get().text).toBe('');
  });

  it('drops a saved copy older than its limit', () => {
    const a = createKeptStore('test-old', () => ({ n: 0 }), { maxAgeMs: 1000 });
    a.load('user-1');
    a.setter()({ n: 5 });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);
    const reloaded = createKeptStore('test-old', () => ({ n: 0 }), { maxAgeMs: 1000 });
    reloaded.load('user-1');
    expect(reloaded.get().n).toBe(0);
    vi.restoreAllMocks();
  });

  it('ignores a late update meant for the previous user', () => {
    const a = createKeptStore('test-late', () => ({ text: '' }));
    a.load('user-1');
    const setForUser1 = a.setter();
    a.load('user-2');
    setForUser1({ text: 'owner answer' });
    expect(a.get().text).toBe('');
  });
});

describe('AI assistant keeps the conversation', () => {
  it('an answer that arrives after leaving the page is there on return', async () => {
    let answer!: (v: unknown) => void;
    mocks.invoke.mockReturnValue(new Promise((r) => { answer = r; }));

    const first = render(<AIAssistant />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything about your business...'), { target: { value: 'Best product?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Best product?')).toBeInTheDocument();
    first.unmount(); // the seller goes to another page

    answer({ data: { response: 'Panjabi sells best.' }, error: null });
    await new Promise((r) => setTimeout(r, 0));

    render(<AIAssistant />);
    await waitFor(() => expect(screen.getByText('Panjabi sells best.')).toBeInTheDocument());
    expect(screen.getByText('Best product?')).toBeInTheDocument();
  });

  it('"New chat" starts over', async () => {
    mocks.invoke.mockResolvedValue({ data: { response: 'Hello!' }, error: null });
    render(<AIAssistant />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything about your business...'), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Hello!');
    fireEvent.click(screen.getByRole('button', { name: /New chat/ }));
    await waitFor(() => expect(screen.queryByText('Hello!')).not.toBeInTheDocument());
    expect(screen.getByText('Ask about your business')).toBeInTheDocument();
  });
});

describe('order form keeps a draft', () => {
  it('a half-typed order comes back after closing, until saved', async () => {
    const onClose = vi.fn();
    const first = render(<AddOrderModal externalOpen onClose={onClose} />);
    await screen.findByRole('option', { name: /Panjabi/ });
    fireEvent.change(screen.getByLabelText('Customer name *'), { target: { value: 'Rahima' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '01712345678' } });
    first.unmount();

    render(<AddOrderModal externalOpen onClose={onClose} />);
    expect(await screen.findByText('Your unsaved order is back.')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer name *')).toHaveValue('Rahima');
    expect(screen.getByLabelText('Phone')).toHaveValue('01712345678');

    fireEvent.click(screen.getByRole('button', { name: 'Start fresh' }));
    expect(screen.getByLabelText('Customer name *')).toHaveValue('');
    expect(screen.queryByText('Your unsaved order is back.')).not.toBeInTheDocument();
  });

  it('saving the order removes its draft', async () => {
    const onClose = vi.fn();
    const first = render(<AddOrderModal externalOpen onClose={onClose} />);
    await screen.findByRole('option', { name: /Panjabi/ });
    fireEvent.change(screen.getByLabelText('Customer name *'), { target: { value: 'Karim' } });
    fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Facebook' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    first.unmount();

    render(<AddOrderModal externalOpen onClose={onClose} />);
    await screen.findByRole('option', { name: /Panjabi/ });
    expect(screen.queryByText('Your unsaved order is back.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Customer name *')).toHaveValue('');
  });
});
