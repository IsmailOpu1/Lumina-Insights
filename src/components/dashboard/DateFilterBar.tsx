import { useFilter, type DateFilterType } from '@/context/FilterContext';
import { Input } from '@/components/ui/input';
import Segmented from './Segmented';
import { msg, useT } from '@/i18n';

const OPTIONS: { label: string; value: DateFilterType }[] = [
  { label: msg('Today'), value: 'today' },
  { label: msg('7 days'), value: '7days' },
  { label: msg('30 days'), value: '30days' },
  { label: msg('All time'), value: 'all' },
  { label: msg('Custom'), value: 'custom' },
];

const toInput = (d: Date | null) => (d ? d.toISOString().split('T')[0] : '');

export default function DateFilterBar() {
  const { t } = useT();
  const { dateFilter, setDateFilter, customRange, setCustomRange } = useFilter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dateFilter === 'custom' && (
        <div className="flex items-center gap-2 max-sm:w-full">
          <Input
            type="date"
            aria-label={t('From date')}
            className="h-8 w-[150px] text-xs max-sm:w-auto max-sm:min-w-0 max-sm:flex-1"
            value={toInput(customRange.from)}
            onChange={(e) => setCustomRange({ ...customRange, from: e.target.value ? new Date(e.target.value) : null })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label={t('To date')}
            className="h-8 w-[150px] text-xs max-sm:w-auto max-sm:min-w-0 max-sm:flex-1"
            value={toInput(customRange.to)}
            onChange={(e) => setCustomRange({ ...customRange, to: e.target.value ? new Date(e.target.value) : null })}
          />
        </div>
      )}
      <Segmented label={msg('Date range')} value={dateFilter} onChange={setDateFilter} options={OPTIONS} />
    </div>
  );
}
