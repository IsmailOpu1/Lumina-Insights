import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import bn from '@/i18n/bn';
import { LanguageProvider, tr, useT } from '@/i18n';
import { ORDER_STATUSES, EXPENSE_TYPES } from '@/lib/constants';
import { NAV_GROUPS } from '@/components/Sidebar';
import { ROUTE_TITLES } from '@/components/Topbar';
import { NOTIFICATION_KEYS, notificationText } from '@/i18n/notifications';

/** Every English text passed to t(), tr() or msg() in the app's code. */
function wrappedTexts() {
  const files = readdirSync('src', { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/(^|[\\/])test[\\/]/.test(f));
  const found = new Map<string, string>();
  const call = /\b(?:t|tr|msg)\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/g;
  for (const file of files) {
    const source = readFileSync(join('src', file), 'utf8');
    for (const m of source.matchAll(call)) {
      const text = (m[1] ?? m[2]).replace(/\\(.)/g, '$1');
      found.set(text, file);
    }
  }
  return found;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Bangla dictionary', () => {
  it('has a translation for every wrapped text', () => {
    const missing = [...wrappedTexts()].filter(([text]) => !(text in bn)).map(([text, file]) => `${file}: ${text}`);
    expect(missing).toEqual([]);
  });

  it('covers text that is translated through a variable', () => {
    const dynamic = [
      ...ORDER_STATUSES, ...EXPENSE_TYPES,
      ...NAV_GROUPS.flatMap((g) => [g.label, ...g.items.map((i) => i.label)]),
      ...Object.values(ROUTE_TITLES),
      ...NOTIFICATION_KEYS,
    ];
    expect(dynamic.filter((text) => !(text in bn))).toEqual([]);
  });

  it('keeps every {placeholder}', () => {
    const broken = Object.entries(bn).filter(([en, b]) => placeholders(en).join() !== placeholders(b).join());
    expect(broken).toEqual([]);
  });
});

describe('translating', () => {
  function Probe() {
    const { t, lang, setLang } = useT();
    return (
      <>
        <p>{t('Orders')}</p>
        <p>{t('Notifications, {n} unread', { n: 3 })}</p>
        <p>{t('Some text nobody translated')}</p>
        <button onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}>switch</button>
      </>
    );
  }

  it('switches between English and Bangla, and remembers the choice', async () => {
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Notifications, 3 unread')).toBeInTheDocument();

    await act(async () => { screen.getByText('switch').click(); });
    expect(await screen.findByText('অর্ডার')).toBeInTheDocument();
    expect(screen.getByText('নোটিফিকেশন, 3টি অপঠিত')).toBeInTheDocument();
    // Untranslated text falls back to English instead of disappearing.
    expect(screen.getByText('Some text nobody translated')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('bn');
    expect(localStorage.getItem('lumina-lang')).toBe('bn');
    expect(tr('Cancelled')).toBe('বাতিল');
    // Database notifications: names, numbers and amounts are kept.
    expect(notificationText({ title: 'New Order Received', message: 'Order ORD-042 from Rahim Uddin for ৳2900' }))
      .toEqual({ title: 'নতুন অর্ডার এসেছে', message: 'Rahim Uddin-এর কাছ থেকে অর্ডার ORD-042, ৳2900' });
    expect(notificationText({ title: 'Something new', message: 'An unknown message' }))
      .toEqual({ title: 'Something new', message: 'An unknown message' });

    await act(async () => { screen.getByText('switch').click(); });
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(localStorage.getItem('lumina-lang')).toBe('en');
  });
});
