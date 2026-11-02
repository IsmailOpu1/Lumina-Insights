import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import Orders from '@/pages/Orders';

const today = format(new Date(), 'yyyy-MM-dd');
const mocks = vi.hoisted(() => ({
  readOnly: false,
  update: vi.fn(),
  updateError: null as { message: string } | null,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/fetchAll', () => ({
  fetchAll: async () => ({
    data: [{
      id: 'o1', order_number: 'ORD-045', customer_name: 'Rahim', product_id: null, product_name: 'Panjabi', source: 'Facebook',
      status: 'Pending', quantity: 1, selling_price: 1000, unit_cost: 400, shipping_cost: 60, ad_cost: 0, profit_per_order: 540, date: today,
    }],
    error: null,
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (row: { status: string }) => ({
        eq: () => { mocks.update(row.status); return Promise.resolve({ error: mocks.updateError }); },
      }),
      // The row read back after the change, with the database's numbers.
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  },
}));
vi.mock('@/context/FABContext', () => ({ useRefreshOnSave: () => {} }));
vi.mock('@/hooks/useReadOnly', () => ({ useReadOnly: () => mocks.readOnly }));
vi.mock('@/hooks/useExportGate', () => ({ useExportGate: () => () => true }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({ formatCurrency: (n: number) => `৳${n}`, symbol: '৳' }) }));
vi.mock('@/components/AddOrderModal', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readOnly = false;
  mocks.updateError = null;
});

// The page shows the order twice (phone card and table); both use the picker.
const pickers = () => screen.getAllByLabelText('Status of order ORD-045');

describe('Changing an order status from the list', () => {
  it('saves the new status in one step and offers undo', async () => {
    render(<Orders />);
    await screen.findAllByText('Rahim');
    fireEvent.change(pickers()[0], { target: { value: 'Delivered' } });

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('Delivered'));
    pickers().forEach((p) => expect(p).toHaveValue('Delivered'));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    const [message, options] = mocks.toastSuccess.mock.calls[0];
    expect(message).toBe('ORD-045 marked Delivered');

    // Undo puts the old status back, without another undo toast.
    options.action.onClick();
    await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith('Pending'));
    await waitFor(() => pickers().forEach((p) => expect(p).toHaveValue('Pending')));
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('puts the status back when the change is refused', async () => {
    mocks.updateError = { message: 'Not enough stock' };
    render(<Orders />);
    await screen.findAllByText('Rahim');
    fireEvent.change(pickers()[0], { target: { value: 'Shipped' } });
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    pickers().forEach((p) => expect(p).toHaveValue('Pending'));
  });

  it('viewers see the status but cannot change it', async () => {
    mocks.readOnly = true;
    render(<Orders />);
    await screen.findAllByText('Rahim');
    expect(screen.queryByLabelText('Status of order ORD-045')).not.toBeInTheDocument();
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });
});

describe('Opening orders from a dashboard link', () => {
  it('/orders?status=Shipped shows only shipped orders', async () => {
    window.history.pushState({}, '', '/orders?status=Shipped');
    try {
      render(<Orders />);
      expect(await screen.findByText('Shipped', { selector: 'button span' })).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 50)); // the order list has loaded
      expect(screen.queryByText('Rahim')).not.toBeInTheDocument();
    } finally {
      window.history.pushState({}, '', '/');
    }
  });
});
