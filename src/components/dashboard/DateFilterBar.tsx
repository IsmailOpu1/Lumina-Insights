import { useFilter } from '@/context/FilterContext';

type DateFilterType = 'today' | '7days' | '30days' | 'custom';

const PILLS: {label: string;value: DateFilterType;}[] = [
{ label: 'Today', value: 'today' },
{ label: '7 Days', value: '7days' },
{ label: '30 Days', value: '30days' },
{ label: 'Custom', value: 'custom' }];


export default function DateFilterBar() {
  const { dateFilter, setDateFilter, customRange, setCustomRange } = useFilter();

  return (
    <div className="mb-6 py-3">
      <div className="flex flex-wrap items-center gap-2 text-secondary">
        {PILLS.map((p) =>
        <button
          key={p.value}
          onClick={() => setDateFilter(p.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-extrabold transition-colors duration-100 active:scale-[0.97] ${
          dateFilter === p.value ?
          'bg-slate-950 text-primary-foreground' :
          'border border-border hover:border-primary bg-slate-950 text-yellow-200'}`
          }>
          
            {p.label}
          </button>
        )}

        {dateFilter === 'custom' &&
        <div className="flex items-center gap-2 ml-2">
            <input
            type="date"
            value={customRange.from ? customRange.from.toISOString().split('T')[0] : ''}
            onChange={(e) => setCustomRange({ ...customRange, from: e.target.value ? new Date(e.target.value) : null })}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-bold text-foreground" />
          
            <span className="text-sm text-muted-foreground">to</span>
            <input
            type="date"
            value={customRange.to ? customRange.to.toISOString().split('T')[0] : ''}
            onChange={(e) => setCustomRange({ ...customRange, to: e.target.value ? new Date(e.target.value) : null })}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-bold text-foreground" />
          
          </div>
        }
      </div>
    </div>);

}