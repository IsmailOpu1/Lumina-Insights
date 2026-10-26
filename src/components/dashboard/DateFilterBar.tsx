import { useFilter } from '@/context/FilterContext';
import { Input } from '@/components/ui/input';
import Segmented from './Segmented';

type DateFilterType = 'today' | '7days' | '30days' | 'custom';

const OPTIONS: { label: string; value: DateFilterType }[] = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: '7days' },
  { label: '30 days', value: '30days' },
  { label: 'Custom', value: 'custom' },
];

const toInput = (d: Date | null) => (d ? d.toISOString().split('T')[0] : '');

export default function DateFilterBar() {
  const { dateFilter, setDateFilter, customRange, setCustomRange } = useFilter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dateFilter === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="From date"
            className="h-8 w-[150px] text-xs"
            value={toInput(customRange.from)}
            onChange={(e) => setCustomRange({ ...customRange, from: e.target.value ? new Date(e.target.value) : null })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            className="h-8 w-[150px] text-xs"
            value={toInput(customRange.to)}
            onChange={(e) => setCustomRange({ ...customRange, to: e.target.value ? new Date(e.target.value) : null })}
          />
        </div>
      )}
      <Segmented label="Date range" value={dateFilter} onChange={setDateFilter} options={OPTIONS} />
    </div>
  );
}
