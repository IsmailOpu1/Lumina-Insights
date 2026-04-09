import { useState } from 'react';
import { formatTaka } from '@/lib/constants';

export default function ProfitCalculator() {
  const [cost, setCost] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [ad, setAd] = useState(0);
  const [selling, setSelling] = useState(0);

  const profit = selling - cost - shipping - ad;
  const margin = selling > 0 ? profit / selling * 100 : 0;
  const breakeven = selling - cost - shipping;
  const hasPrice = selling > 0;

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="card-hover mb-6 rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)]">
      <h3 className="mb-4 text-base font-bold text-foreground">Profit Calculator</h3>
      <div className="grid gap-6 md:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-3">
          {[
          { label: 'Cost Price ৳', value: cost, set: setCost },
          { label: 'Shipping Cost ৳', value: shipping, set: setShipping },
          { label: 'Ad Cost ৳', value: ad, set: setAd },
          { label: 'Selling Price ৳', value: selling, set: setSelling }].
          map((f) =>
          <div key={f.label}>
              <label className="mb-1 block text-sm font-extrabold text-accent">{f.label}</label>
              <input
              type="number"
              placeholder="0"
              value={f.value || ''}
              onChange={(e) => f.set(Number(e.target.value) || 0)}
              className={inputClass} />
            
            </div>
          )}
        </div>

        {/* Outputs */}
        <div className="flex flex-col justify-center space-y-4">
          <div>
            <p className="text-accent text-sm font-extrabold">Profit per Unit</p>
            <p className="text-2xl font-bold" style={{ color: !hasPrice ? undefined : profit >= 0 ? '#10B981' : '#EF4444' }}>
              {hasPrice ? formatTaka(profit) : '—'}
            </p>
          </div>
          <div>
            <p className="text-accent font-extrabold text-sm">Profit Margin</p>
            <p className="text-2xl font-bold" style={{ color: !hasPrice ? undefined : profit >= 0 ? '#10B981' : '#EF4444' }}>
              {hasPrice ? `${margin.toFixed(1)}%` : '—'}
            </p>
          </div>
          <div>
            <p className="text-sm font-extrabold text-accent">Break-even Ad Cost</p>
            <p className="text-lg font-bold text-muted-foreground">
              {hasPrice ? formatTaka(breakeven) : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>);

}