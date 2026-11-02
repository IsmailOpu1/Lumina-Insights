import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/context/SubscriptionContext';
import { parseDay } from '@/lib/dates';
import { currentDateLocale, useT } from '@/i18n';

interface Summary {
  summary: string;
  from: string;
  to: string;
}

/**
 * "Your week": a few sentences from the AI on how last week went, why, and
 * one thing to do this week. Written once a week on the server and kept, so
 * opening the dashboard doesn't use the AI questions. Pro and trial only;
 * hidden when there is nothing to say or the AI can't be reached.
 */
export default function WeeklySummary() {
  const { t, lang } = useT();
  const { features } = useSubscription();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!features.weeklySummary) return;
    let cancelled = false;
    setLoading(true);
    supabase.functions.invoke('weekly-summary', { body: { language: lang } }).then(({ data: res, error }) => {
      if (cancelled) return;
      setLoading(false);
      setData(!error && res?.summary ? res as Summary : null);
    });
    return () => { cancelled = true; };
  }, [features.weeklySummary, lang]);

  if (!features.weeklySummary || (!loading && !data)) return null;

  const day = (d: string) => format(parseDay(d), 'd MMM', { locale: currentDateLocale() });

  return (
    <section aria-labelledby="week-title" className="surface mb-6 border-primary/30 p-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="week-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles size={16} className="text-primary" />
          {t('Your week')}
        </h2>
        {data && <span className="text-xs text-muted-foreground">{day(data.from)} – {day(data.to)}</span>}
      </div>
      {loading ? (
        <p className="animate-pulse text-sm text-muted-foreground">{t('Writing your weekly summary…')}</p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-foreground">{data!.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t('Written by AI from your numbers. Check before acting on it.')}</p>
        </>
      )}
    </section>
  );
}
