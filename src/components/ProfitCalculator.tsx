import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import ChartCard from '@/components/dashboard/ChartCard';
import { useT } from '@/i18n';

/** Quick "what if" for pricing a single unit. */
export default function ProfitCalculator() {
  const { t } = useT();
  const { formatCurrency, symbol } = useCurrency();
  const [cost, setCost] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [ad, setAd] = useState(0);
  const [selling, setSelling] = useState(0);

  const profit = selling - cost - shipping - ad;
  const margin = selling > 0 ? (profit / selling) * 100 : 0;
  const breakeven = selling - cost - shipping;
  const hasPrice = selling > 0;
  const tone = !hasPrice ? 'text-foreground' : profit >= 0 ? 'text-success' : 'text-destructive';

  const fields = [
    { id: 'calc-selling', label: `${t('Selling price')} ${symbol}`, value: selling, set: setSelling },
    { id: 'calc-cost', label: `${t('Product cost')} ${symbol}`, value: cost, set: setCost },
    { id: 'calc-shipping', label: `${t('Shipping')} ${symbol}`, value: shipping, set: setShipping },
    { id: 'calc-ad', label: `${t('Ad cost')} ${symbol}`, value: ad, set: setAd },
  ];

  return (
    <ChartCard
      title={t('One unit')}
      subtitle={t('The result updates as you type')}
      action={<Calculator size={16} className="text-muted-foreground" />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.id}>
              <Label htmlFor={f.id} className="mb-1.5 block text-xs text-muted-foreground">{f.label}</Label>
              <Input
                id={f.id}
                type="number"
                min={0}
                placeholder="0"
                value={f.value || ''}
                onChange={(e) => f.set(Number(e.target.value) || 0)}
              />
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="eyebrow">{t('Profit per unit')}</p>
          <p className={cn('mt-1 text-3xl font-semibold tabular-nums', tone)}>{hasPrice ? formatCurrency(profit) : '—'}</p>
          <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('Margin')}</span>
              <span className={cn('font-medium tabular-nums', tone)}>{hasPrice ? `${margin.toFixed(1)}%` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('Most you can spend on ads')}</span>
              <span className="font-medium tabular-nums text-foreground">{hasPrice ? formatCurrency(breakeven) : '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </ChartCard>
  );
}
