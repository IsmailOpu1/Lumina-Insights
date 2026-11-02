import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddOrderModal from '@/components/AddOrderModal';
import type { ReadOrder } from '@/components/orders/OrderReader';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  invoke: vi.fn(),
  onClose: vi.fn(),
  onSaved: vi.fn(),
  // The last order with a given phone number, for the returning-customer lookup.
  byPhone: {} as Record<string, { customer_name: string; customer_address: string | null; count: number }>,
  products: [
    { id: 'p1', product_name: 'Panjabi', selling_price: 1200, cost_price: 500, stock_quantity: 7, low_stock_threshold: 5 },
    { id: 'p2', product_name: 'Saree', selling_price: 2500, cost_price: 1500, stock_quantity: 9, low_stock_threshold: 5 },
  ],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: (table: string) => {
      if (table === 'inventory') {
        return { select: () => ({ order: () => Promise.resolve({ data: mocks.products, error: null }) }) };
      }
      return {
        insert: (row: unknown) => { mocks.insert(row); return Promise.resolve({ error: null }); },
        select: () => ({
          // Next order number.
          order: () => ({ limit: () => Promise.resolve({ data: [{ order_number: 'ORD-007' }] }) }),
          // Returning customer by phone.
          eq: (_col: string, phone: string) => ({
            order: () => ({
              limit: () => {
                const hit = mocks.byPhone[phone];
                return Promise.resolve(hit
                  ? { data: [{ customer_name: hit.customer_name, customer_address: hit.customer_address }], count: hit.count }
                  : { data: [], count: 0 });
              },
            }),
          }),
        }),
      };
    },
  },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ ownerIdForQueries: 'owner-1', workspace: { currency: 'BDT' } }),
}));
vi.mock('@/context/FABContext', () => ({
  useFAB: () => ({ activeModal: null, closeModal: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const chatOrder: ReadOrder = {
  found: true,
  customer_name: 'Rahima Akter',
  customer_phone: '01712345678',
  customer_address: 'House 5, Road 2, Mirpur 10, Dhaka',
  source: 'Facebook',
  delivery_charge: 60,
  date: null,
  items: [
    { product_id: 'p1', product_text: 'black panjabi L', quantity: 2, unit_price: 1150 },
    { product_id: null, product_text: 'blue scarf', quantity: 1, unit_price: 350 },
  ],
};

function openNew() {
  render(<AddOrderModal externalOpen onClose={mocks.onClose} onSaved={mocks.onSaved} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.byPhone = {};
  try { localStorage.clear(); } catch { /* ignore */ }
  mocks.invoke.mockResolvedValue({ data: chatOrder, error: null });
});

async function readChat() {
  openNew();
  await screen.findByRole('option', { name: /Saree/ });
  fireEvent.change(screen.getByLabelText('Customer chat'), { target: { value: 'Apu 2ta black panjabi L dien...' } });
  fireEvent.click(screen.getByRole('button', { name: 'Read order' }));
  await screen.findByText('Filled from the chat. Check everything before saving.');
}

describe('Order form — fill from a chat', () => {
  it('fills the customer, product and costs from the chat', async () => {
    await readChat();
    expect(mocks.invoke).toHaveBeenCalledWith('read-order', { body: { text: 'Apu 2ta black panjabi L dien...' } });
    expect(screen.getByLabelText('Customer name *')).toHaveValue('Rahima Akter');
    expect(screen.getByLabelText('Phone')).toHaveValue('01712345678');
    expect(screen.getByLabelText('Delivery address')).toHaveValue('House 5, Road 2, Mirpur 10, Dhaka');
    expect(screen.getByLabelText('Product')).toHaveValue('p1');
    expect(screen.getByLabelText('Quantity *')).toHaveValue(2);
    expect(screen.getByLabelText(/^Selling price/)).toHaveValue(1150);
    expect(screen.getByLabelText(/^Shipping cost/)).toHaveValue(60);
    expect(screen.getByLabelText('Source')).toHaveValue('Facebook');
    expect(screen.getByText('1 more from this chat')).toBeInTheDocument();
  });

  it('saves each product of the chat in turn, for the same customer', async () => {
    await readChat();
    fireEvent.click(screen.getByRole('button', { name: 'Save and fill the next product' }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      customer_name: 'Rahima Akter', customer_phone: '01712345678', product_id: 'p1', quantity: 2, selling_price: 1150, shipping_cost: 60,
    });

    // The scarf is not in the shop's products: the seller is told to pick one.
    expect(await screen.findByText('"blue scarf" is not in your products. Pick the right one below.')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer name *')).toHaveValue('Rahima Akter');
    expect(screen.getByLabelText('Product')).toHaveValue('');
    expect(mocks.onClose).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'p2' } });
    fireEvent.change(screen.getByLabelText(/^Selling price/), { target: { value: '350' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(2));
    expect(mocks.insert.mock.calls[1][0]).toMatchObject({ customer_name: 'Rahima Akter', product_id: 'p2', selling_price: 350 });
    await waitFor(() => expect(mocks.onClose).toHaveBeenCalled());
  });

  it('says so when the chat holds no order', async () => {
    mocks.invoke.mockResolvedValue({ data: { ...chatOrder, found: false, items: [] }, error: null });
    openNew();
    fireEvent.change(screen.getByLabelText('Customer chat'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't find an order");
    expect(screen.getByLabelText('Customer name *')).toHaveValue('');
  });
});

describe('Order form — faster manual entry', () => {
  it('"Save and add another" keeps the form open, keeping source and delivery cost', async () => {
    openNew();
    await screen.findByRole('option', { name: /Saree/ });
    fireEvent.change(screen.getByLabelText('Customer name *'), { target: { value: 'Karim' } });
    fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'p2' } });
    fireEvent.change(screen.getByLabelText(/^Shipping cost/), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'WhatsApp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and add another' }));

    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText('Customer name *')).toHaveValue(''));
    expect(screen.getByLabelText('Product')).toHaveValue('');
    expect(screen.getByLabelText('Source')).toHaveValue('WhatsApp');
    expect(screen.getByLabelText(/^Shipping cost/)).toHaveValue(120);
    expect(mocks.onSaved).toHaveBeenCalledTimes(1);
    expect(mocks.onClose).not.toHaveBeenCalled();
  });

  it('remembers the last source and delivery cost for the next order', async () => {
    localStorage.setItem('lumina-order-defaults', JSON.stringify({ source: 'Instagram', shippingCost: '80' }));
    openNew();
    expect(screen.getByLabelText('Source')).toHaveValue('Instagram');
    expect(screen.getByLabelText(/^Shipping cost/)).toHaveValue(80);
  });

  it('fills a returning customer from their phone number', async () => {
    mocks.byPhone['01811111111'] = { customer_name: 'Nusrat', customer_address: 'Chattogram', count: 3 };
    openNew();
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '01811-111111' } });
    expect(await screen.findByText('Returning customer · 3 orders')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer name *')).toHaveValue('Nusrat');
    expect(screen.getByLabelText('Delivery address')).toHaveValue('Chattogram');
  });

  it('a duplicate starts a new order from the old one', async () => {
    render(
      <AddOrderModal
        externalOpen
        copyFrom={{
          id: 'o1', order_number: 'ORD-002', customer_name: 'Rahim', customer_phone: '01700000000', customer_address: 'Sylhet',
          product_id: 'p1', quantity: 1, selling_price: 1200, shipping_cost: 100, ad_cost: 0, source: 'Facebook', status: 'Delivered', date: '2026-10-01',
        }}
        onClose={mocks.onClose}
        onSaved={mocks.onSaved}
      />
    );
    expect(await screen.findByText('ORD-008')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer name *')).toHaveValue('Rahim');
    expect(screen.getByLabelText('Status')).toHaveValue('Pending');
    expect(screen.queryByLabelText('Customer chat')).not.toBeInTheDocument();
  });
});
