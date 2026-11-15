import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useT } from '@/i18n';

// The same card as the other stand-alone pages (invite, reset), so a wrong link
// still looks like Lumina.
const NotFound = () => {
  const { t } = useT();
  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 text-center shadow-2xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold text-foreground">Lumina Insights</span>
        </div>
        <p className="mb-2 text-5xl font-bold text-foreground">404</p>
        <h1 className="mb-6 text-lg text-muted-foreground">{t('Oops! Page not found')}</h1>
        <Link
          to="/"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110"
        >
          {t('Return to Home')}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
