import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddOrderModal, { type OrderToEdit } from '@/components/AddOrderModal';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  products: [
    // Current cost is 500; existing orders were placed at 300.
    { id: 'p1', product_name: 'Panjabi', selling_price: 1200, cost_price: 500, stock_quantity: 7, low_stock_threshold: 5 },
    { id: 'p2', product_name: 'Saree', selling_price: 2500, cost_price: 1500, stock_quantity: 2, low_stock_threshold: 5 },
  ],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) =>
      table === 'inventory'
        ? { select: () => ({ order: () => Promise.resolve({ data: mocks.products, error: null }) }) }
        : {
            update: (payload: unknown) => {
              mocks.update(payload);
              return { eq: () => Promise.resolve({ error: null }) };
            },
          },
  },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ ownerIdForQueries: 'owner-1', workspace: { currency: 'BDT' } }),
}));
vi.mock('@/context/FABContext', () => ({
  useFAB: () => ({ activeModal: null, closeModal: vi.fn() }),
}));

const pendingOrder: OrderToEdit = {
  id: 'o1',
  order_number: 'ORD-001',
  customer_name: 'Rahim',
  product_id: 'p1',
  product_name: 'Panjabi',
  quantity: 3,
  selling_price: 1000,
  unit_cost: 300,
  shipping_cost: 0,
  ad_cost: 0,
  source: 'Facebook',
  status: 'Pending',
  date: '2026-10-20',
};

function openEdit(order: OrderToEdit) {
  render(<AddOrderModal externalOpen editOrder={order} onClose={vi.fn()} onSaved={vi.fn()} />);
}

function setQuantity(value: string) {
  fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value } });
  fireEvent.blur(screen.getByLabelText(/Quantity/));
}

beforeEach(() => mocks.update.mockClear());

describe('AddOrderModal — editing an order', () => {
  it('counts units the order already holds as available', async () => {
    openEdit(pendingOrder);
    expect(await screen.findByText('10 units available (7 in stock + 3 held by this order)')).toBeInTheDocument();

    setQuantity('10');
    expect(screen.queryByText(/Only \d+ units available/)).not.toBeInTheDocument();

    setQuantity('11');
    expect(screen.getByText('Only 10 units available')).toBeInTheDocument();
  });

  it('previews profit with the cost saved on the order, not today’s cost', async () => {
    openEdit(pendingOrder);
    await screen.findByText(/units available/);
    // 3 units at the saved cost of 300 → COGS 900 (today's 500 would be 1,500)
    const cogsRow = screen.getByText(/^COGS/).parentElement!;
    expect(cogsRow).toHaveTextContent('৳900');
    expect(cogsRow).not.toHaveTextContent('৳1,500');
  });

  it('a cancelled order holds no stock and is not stock-limited', async () => {
    openEdit({ ...pendingOrder, status: 'Cancelled' });
    expect(await screen.findByText('7 units in stock')).toBeInTheDocument();
    setQuantity('50');
    expect(screen.queryByText(/Only \d+ units available/)).not.toBeInTheDocument();
  });

  it('switching product only counts that product’s stock', async () => {
    openEdit(pendingOrder);
    const productSelect = (await screen.findByRole('option', { name: /Saree/ })).closest('select')!;
    fireEvent.change(productSelect, { target: { value: 'p2' } });
    expect(screen.getByText('2 units in stock')).toBeInTheDocument();
    setQuantity('3');
    expect(screen.getByText('Only 2 units available')).toBeInTheDocument();
  });

  it('an order whose product was deleted can still be saved', async () => {
    openEdit({ ...pendingOrder, product_id: null, product_name: 'Old Saree' });
    expect(await screen.findByRole('option', { name: 'Old Saree (deleted)' })).toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Update Order' });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ product_id: null, quantity: 3 });
  });
});
