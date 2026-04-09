import React, { createContext, useContext, useState, useMemo } from 'react';
import { startOfDay, subDays, startOfToday } from 'date-fns';

type DateFilterType = 'today' | '7days' | '30days' | 'custom';

interface FilterContextType {
  dateFilter: DateFilterType;
  customRange: { from: Date | null; to: Date | null };
  setDateFilter: (f: DateFilterType) => void;
  setCustomRange: (r: { from: Date | null; to: Date | null }) => void;
  getDateRange: () => { from: Date; to: Date };
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [dateFilter, setDateFilter] = useState<DateFilterType>('7days');
  const [customRange, setCustomRange] = useState<{ from: Date | null; to: Date | null }>({
    from: null,
    to: null,
  });

  const getDateRange = useMemo(() => () => {
    const now = new Date();
    const today = startOfToday();

    switch (dateFilter) {
      case 'today':
        return { from: today, to: now };
      case '7days':
        return { from: startOfDay(subDays(now, 7)), to: now };
      case '30days':
        return { from: startOfDay(subDays(now, 30)), to: now };
      case 'custom':
        return {
          from: customRange.from ?? startOfDay(subDays(now, 7)),
          to: customRange.to ?? now,
        };
      default:
        return { from: startOfDay(subDays(now, 7)), to: now };
    }
  }, [dateFilter, customRange]);

  return (
    <FilterContext.Provider value={{ dateFilter, customRange, setDateFilter, setCustomRange, getDateRange }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be used within FilterProvider');
  return ctx;
}
