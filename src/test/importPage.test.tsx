import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ImportData from '@/pages/ImportData';
import { autoMap } from '@/lib/import/fields';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  readOnly: false,
}));

function query(data: unknown[] = []) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data, error: null });
  return q;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc, from: () => query(), functions: { invoke: mocks.invoke } },
}));
vi.mock('@/hooks/useReadOnly', () => ({ useReadOnly: () => mocks.readOnly }));
vi.mock('@/context/SubscriptionContext', () => ({ useSubscription: () => ({ refresh: vi.fn() }) }));
vi.mock('@/context/NotificationContext', () => ({ useNotifications: () => ({ refreshCount: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const CSV = [
  'Date,Customer,Item,Qty,Total,Channel',
  '05/01/2024,Rahim,Panjabi,2,"৳2,400",FB',
  '06/01/2024,Karim,Saree,1,2000,Insta',
  'oops,Nila,Saree,1,1500,Daraz',
].join('\n');

function upload() {
  const input = screen.getByLabelText('Choose a spreadsheet to import');
  fireEvent.change(input, { target: { files: [new File([CSV], 'sales.csv', { type: 'text/csv' })] } });
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
  mocks.readOnly = false;
  localStorage.clear();
});

describe('Import page', () => {
  it('reads a file, shows what will import, and imports only good rows', async () => {
    mocks.invoke.mockResolvedValue({
      data: { sheets: [{ entity: 'orders', mapping: ['date', 'customer_name', 'product_name', 'quantity', 'total', 'source'] }] },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: { orders_created: 2, orders_skipped: 0, products_created: 0, products_updated: 0, expenses_created: 0, expenses_skipped: 0 },
      error: null,
    });

    render(<MemoryRouter><ImportData /></MemoryRouter>);
    upload();

    expect(await screen.findByText('2 rows ready')).toBeInTheDocument();
    expect(screen.getByText('1 row needs attention')).toBeInTheDocument();
    expect(screen.getByText(/Matched by Lumina AI/)).toBeInTheDocument();
    // Only column names and sample rows go to the AI.
    const sent = mocks.invoke.mock.calls[0][1].body.sheets[0];
    expect(sent.headers).toEqual(['Date', 'Customer', 'Item', 'Qty', 'Total', 'Channel']);
    expect(sent.sample.length).toBeLessThanOrEqual(5);

    fireEvent.click(screen.getByRole('button', { name: /Import now/ }));
    await screen.findByText('Import complete');

    const [fn, args] = mocks.rpc.mock.calls[0];
    expect(fn).toBe('import_business_data');
    expect(args.p_file_name).toBe('sales.csv');
    expect(args.p_orders).toEqual([
      { date: '2024-01-05', customer_name: 'Rahim', product_name: 'Panjabi', quantity: 2, selling_price: 1200, source: 'Facebook' },
      { date: '2024-01-06', customer_name: 'Karim', product_name: 'Saree', quantity: 1, selling_price: 2000, source: 'Instagram' },
    ]);
    expect(args.p_inventory).toEqual([]);
  });

  it('still matches columns when the AI is unavailable', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('down') });
    render(<MemoryRouter><ImportData /></MemoryRouter>);
    upload();
    expect(await screen.findByText('2 rows ready')).toBeInTheDocument();
    expect(screen.getByText(/Matched automatically/)).toBeInTheDocument();
  });

  it('shows the database error and keeps the review open when an import fails', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('down') });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'plan_limit_orders' } });
    const { toast } = await import('sonner');
    render(<MemoryRouter><ImportData /></MemoryRouter>);
    upload();
    fireEvent.click(await screen.findByRole('button', { name: /Import now/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/more orders from this month/)));
    expect(screen.getByText('2 rows ready')).toBeInTheDocument();
  });

  it('is locked for viewers', () => {
    mocks.readOnly = true;
    render(<MemoryRouter><ImportData /></MemoryRouter>);
    expect(screen.getByText("Importing isn't available")).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose a spreadsheet to import')).not.toBeInTheDocument();
  });
});

describe('Import template', () => {
  it('uses headers the built-in matcher understands fully', () => {
    expect(autoMap('inventory', ['Product name', 'SKU', 'Cost price', 'Selling price', 'Stock', 'Reorder level', 'Supplier']))
      .toEqual(['product_name', 'sku', 'cost_price', 'selling_price', 'stock_quantity', 'low_stock_threshold', 'supplier']);
    expect(autoMap('orders', ['Date', 'Order no', 'Customer', 'Product', 'Qty', 'Unit price', 'Delivery cost', 'Channel', 'Status']))
      .toEqual(['date', 'external_ref', 'customer_name', 'product_name', 'quantity', 'selling_price', 'shipping_cost', 'source', 'status']);
    expect(autoMap('expenses', ['Date', 'Category', 'Amount', 'Platform', 'Notes']))
      .toEqual(['date', 'type', 'amount', 'platform', 'notes']);
  });
});
