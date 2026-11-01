import { Languages } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** Switches between English and Bangla. Labels are written in the language you'd switch to. */
export default function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useT();
  const label = lang === 'bn' ? 'Switch to English' : 'বাংলায় দেখুন';
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
        className,
      )}
    >
      <Languages size={16} />
      <span className="font-medium">{lang === 'bn' ? 'EN' : 'বাংলা'}</span>
    </button>
  );
}
