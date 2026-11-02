import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendingUp, Wallet, ShoppingBag } from 'lucide-react';
import KPICards from '@/components/dashboard/KPICards';

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({ formatCurrency: (n: number) => `৳${Math.round(n)}` }) }));

describe('Top cards compared with the period before', () => {
  it('shows the change up or down, and nothing when there is no earlier period', () => {
    render(
      <KPICards
        loading={false}
        secondary={[]}
        primary={[
          { label: 'Revenue', value: 1200, format: 'taka', icon: TrendingUp, change: { pct: 20, label: 'vs previous 7 days' } },
          { label: 'Net profit', value: 300, format: 'taka', icon: Wallet, change: { pct: -12.4, label: 'vs previous 7 days' } },
          { label: 'Orders', value: 4, format: 'number', icon: ShoppingBag, change: { pct: null, label: 'vs previous 7 days' } },
        ]}
      />
    );
    expect(screen.getByText('20%')).toHaveClass('text-success');
    expect(screen.getByText('12%')).toHaveClass('text-destructive');
    expect(screen.getAllByText('vs previous 7 days')).toHaveLength(2);
  });
});
