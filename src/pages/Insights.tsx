import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { MessageCircle, Repeat, Users, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/fetchAll';
import { parseDay } from '@/lib/dates';
import { cn } from '@/lib/utils';
import {
  bestAdChannel, getAdChannels, getCustomers, slippingAway, whatsAppLink, SLIPPING_DAYS,
  type Customer, type InsightExpense, type InsightOrder,
} from '@/lib/insights';
import { useCurrency } from '@/hooks/useCurrency';
import PageHeader, { StatStrip } from '@/components/PageHeader';
import SkeletonLoader from '@/components/SkeletonLoader';
import ChartCard from '@/components/dashboard/ChartCard';
import Segmented from '@/components/dashboard/Segmented';
import { currentDateLocale, msg, useT } from '@/i18n';

type AdRange = '30' | '90' | 'all';
const AD_RANGES: { label: string; value: AdRange }[] = [
  { label: msg('30 days'), value: '30' },
  { label: msg('90 days'), value: '90' },
  { label: msg('All time'), value: 'all' },
];
const SHOW_SLIPPING = 10;

/**
 * The deeper look the dashboard has no room for: which customers to win
 * back, who the best customers are, and where ad money turns into profit.
 */
export default function Insights() {
  const { t } = useT();
  const { formatCurrency, symbol } = useCurrency();
  const [orders, setOrders] = useState<InsightOrder[] | null>(null);
  const [expenses, setExpenses] = useState<InsightExpense[]>([]);
  const [adRange, setAdRange] = useState<AdRange>('90');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchAll((a, b) => supabase.from('orders')
        .select('customer_name, customer_phone, date, status, source, selling_price, quantity, profit_per_order, ad_cost')
        .order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('expenses').select('type, platform, amount, date').eq('type', 'Ad Spend').order('id').range(a, b)),
    ]).then(([o, e]) => {
      setOrders((o.data as InsightOrder[]) ?? []);
      setExpenses((e.data as InsightExpense[]) ?? []);
    });
  }, []);

  const customers = useMemo(() => getCustomers(orders ?? []), [orders]);
  const slipping = useMemo(() => slippingAway(customers), [customers]);
  const channels = useMemo(() => {
    const since = adRange === 'all' ? '' : format(subDays(new Date(), Number(adRange) - 1), 'yyyy-MM-dd');
    return getAdChannels((orders ?? []).filter((o) => o.date >= since), expenses.filter((e) => e.date >= since));
  }, [orders, expenses, adRange]);

  const header = <PageHeader title={t('Insights')} subtitle={t('Your customers, and where your ad money turns into profit')} />;
  if (!orders) return <div className="mx-auto max-w-[1100px]">{header}<SkeletonLoader variant="card" count={4} /></div>;

  const repeat = customers.filter((c) => c.orders >= 2);
  const total = customers.reduce((s, c) => s + c.spent, 0);
  const repeatShare = total > 0 ? Math.round((repeat.reduce((s, c) => s + c.spent, 0) / total) * 100) : 0;
  const best = bestAdChannel(channels);
  // Small amounts like ৳2.40 per ৳1 need their paisa; formatCurrency rounds to whole taka.
  const perOne = (n: number) => `${n < 0 ? '-' : ''}${symbol}${Math.abs(n).toFixed(2)}`;
  const name = (source: string) => (source === 'Unknown' ? t('Unknown') : source);
  const ago = (c: Customer) => (c.daysSince === 0 ? t('today') : c.daysSince === 1 ? t('yesterday') : t('{n} days ago', { n: c.daysSince }));
  const shownSlipping = showAll ? slipping : slipping.slice(0, SHOW_SLIPPING);

  return (
    <div className="mx-auto max-w-[1100px]">
      {header}

      <StatStrip stats={[
        { label: t('Customers'), value: customers.length.toLocaleString(), icon: Users, hint: t('All time') },
        { label: t('Bought again'), value: `${customers.length ? Math.round((repeat.length / customers.length) * 100) : 0}%`, icon: Repeat, hint: t('{n} repeat customers', { n: repeat.length }) },
        { label: t('Revenue from repeat customers'), value: `${repeatShare}%`, icon: Wallet },
        { label: t('Slipping away'), value: slipping.length.toLocaleString(), icon: MessageCircle, tone: slipping.length ? 'warning' : undefined, hint: t('No order in {n}+ days', { n: SLIPPING_DAYS }) },
      ]} />

      <ChartCard
        title={t('Where your ad money works')}
        subtitle={t('Profit after ads, against what you spent advertising on each channel')}
        className="mb-6"
        action={<Segmented<AdRange> label={msg('Date range')} value={adRange} onChange={setAdRange} options={AD_RANGES} />}
      >
        {best && (
          <p className="mb-4 text-sm text-foreground">
            {t('{source} pays back best: every {one} on ads brought {amount} profit.', {
              source: name(best.source), one: `${symbol}1`, amount: perOne(best.perTaka!),
            })}
          </p>
        )}
        {channels.every((c) => c.adSpend === 0) && (
          <p className="mb-4 text-sm text-muted-foreground">{t('No ad spend in this period. Add ad costs under Expenses → Ad Spend, with the platform, to see this.')}</p>
        )}
        {channels.length > 0 && (
          <div className="-mx-5 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Source')}</th>
                  <th className="text-right">{t('Orders')}</th>
                  <th className="text-right">{t('Ad spend')}</th>
                  <th className="text-right">{t('Profit after ads')}</th>
                  <th className="text-right">{t('Per {one} of ads', { one: `${symbol}1` })}</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.source}>
                    <td className="font-medium">{name(c.source)}</td>
                    <td className="text-right tabular-nums">{c.orders}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{c.adSpend > 0 ? formatCurrency(c.adSpend) : t('No ads')}</td>
                    <td className={cn('text-right font-medium tabular-nums', c.profitAfterAds < 0 ? 'text-destructive' : 'text-foreground')}>
                      {formatCurrency(c.profitAfterAds)}
                    </td>
                    <td className={cn(
                      'text-right tabular-nums',
                      c.perTaka === null ? 'text-muted-foreground' : c.perTaka < 0 ? 'text-destructive' : c.perTaka >= 1 ? 'text-success' : 'text-warning'
                    )}>
                      {c.perTaka === null ? '—' : perOne(c.perTaka)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={t('Customers slipping away')}
          subtitle={t('Bought more than once, but nothing in {n}+ days. A message with an offer can bring them back.', { n: SLIPPING_DAYS })}
        >
          {slipping.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('No regular customers have gone quiet.')}</p>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {shownSlipping.map((c) => <CustomerRow key={c.name} c={c} detail={t('{n} orders · {amount} · last {when}', { n: c.orders, amount: formatCurrency(c.spent), when: ago(c) })} />)}
              </ul>
              {slipping.length > SHOW_SLIPPING && !showAll && (
                <button onClick={() => setShowAll(true)} className="mt-3 text-xs font-medium text-primary hover:underline">
                  {t('Show all {n}', { n: slipping.length })}
                </button>
              )}
            </>
          )}
        </ChartCard>

        <ChartCard title={t('Best customers')} subtitle={t('Who has spent the most with you, all time')}>
          {customers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('No sales yet')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {customers.slice(0, 5).map((c) => (
                <CustomerRow
                  key={c.name}
                  c={c}
                  detail={t('{n} orders · last {when}', { n: c.orders, when: format(parseDay(c.lastOrder), 'd MMM yyyy', { locale: currentDateLocale() }) })}
                  amount={formatCurrency(c.spent)}
                />
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function CustomerRow({ c, detail, amount }: { c: Customer; detail: string; amount?: string }) {
  const { t } = useT();
  const link = whatsAppLink(c.phone);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      {amount && <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{amount}</span>}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="icon-btn shrink-0 text-success"
          aria-label={t('Message {name} on WhatsApp', { name: c.name })}
          title={t('Message {name} on WhatsApp', { name: c.name })}
        >
          <MessageCircle size={16} />
        </a>
      )}
    </li>
  );
}
