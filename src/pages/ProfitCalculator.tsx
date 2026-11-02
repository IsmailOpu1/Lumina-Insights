import PageHeader from '@/components/PageHeader';
import ProfitCalculator from '@/components/ProfitCalculator';
import { useT } from '@/i18n';

/** "What if" pricing, kept apart from the dashboard's "what happened". */
export default function ProfitCalculatorPage() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-[960px]">
      <PageHeader title={t('Profit calculator')} subtitle={t('Check a price before you list it')} />
      <ProfitCalculator />
    </div>
  );
}
