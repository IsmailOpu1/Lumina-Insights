import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TopSellingProductsBar from '@/components/dashboard/TopSellingProductsBar';
import ChannelsTable from '@/components/dashboard/ChannelsTable';

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({ formatCurrency: (n: number) => `৳${n.toLocaleString('en-US')}` }) }));

const products = [
  { name: 'Lungi', qty: 20, revenue: 11000, profit: 1800 },
  { name: 'Jamdani Saree', qty: 3, revenue: 19500, profit: 7400 },
  { name: 'Printed Kurti', qty: 4, revenue: 3800, profit: -350 },
];

const names = () => screen.getAllByRole('listitem').map((li) => li.querySelector('[title]')?.textContent);

describe('Top products: units or profit', () => {
  it('ranks by units sold, and by profit with a loss in red', () => {
    render(<TopSellingProductsBar data={products} loading={false} />);
    expect(names()).toEqual(['Lungi', 'Printed Kurti', 'Jamdani Saree']);
    expect(screen.getByText('20 sold · ৳11,000')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Profit' }));
    expect(names()).toEqual(['Jamdani Saree', 'Lungi', 'Printed Kurti']);
    expect(screen.getByText('৳7,400 · 38% margin')).toBeInTheDocument();
    expect(screen.getByText('৳-350 · -9% margin')).toHaveClass('text-destructive');
  });
});

describe('Channels card', () => {
  const channels = [
    { source: 'WhatsApp', orders: 8, cancelled: 0, returned: 1, lostRate: 12.5, revenue: 18000, profit: 6400 },
    { source: 'Facebook', orders: 14, cancelled: 4, returned: 1, lostRate: 35.7, revenue: 21000, profit: 3100 },
    { source: 'Instagram', orders: 2, cancelled: 0, returned: 0, lostRate: 0, revenue: 2900, profit: 900 },
  ];

  it('names the best channel and the one losing the most orders', () => {
    render(<ChannelsTable data={channels} loading={false} />);
    expect(screen.getByText('WhatsApp earns you the most after cancels and returns.')).toBeInTheDocument();
    expect(screen.getByText('Facebook: 36% of orders are cancelled or returned.')).toBeInTheDocument();

    const facebook = screen.getAllByRole('row').find((r) => within(r).queryByText('Facebook'))!;
    expect(within(facebook).getByText('36%').closest('td')).toHaveClass('text-destructive');
    expect(within(facebook).getByText('৳3,100')).toBeInTheDocument();
  });

  it('does not judge sources with too few orders', () => {
    render(<ChannelsTable data={[channels[2], { ...channels[1], orders: 3 }]} loading={false} />);
    expect(screen.queryByText(/earns you the most/)).not.toBeInTheDocument();
    expect(screen.queryByText(/are cancelled or returned/)).not.toBeInTheDocument();
  });
});
