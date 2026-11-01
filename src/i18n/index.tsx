import { Fragment, createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Locale } from 'date-fns';

/**
 * Lumina's interface languages. Text is written in English in the code and
 * wrapped in t(); the English text is the key into the Bangla dictionary.
 * Anything not translated yet simply shows in English.
 */
export type Language = 'en' | 'bn';
type Dictionary = Record<string, string>;
type Vars = Record<string, string | number>;

const STORAGE_KEY = 'lumina-lang';

function storedLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'bn' ? 'bn' : 'en';
  } catch {
    return 'en';
  }
}

// Module state so code outside components (toasts, helpers) can translate.
let current: Language = storedLanguage();
let dictionary: Dictionary | null = null;
let dateLocale: Locale | undefined;

/** Downloads the Bangla dictionary, date words and font, once. */
let loading: Promise<void> | null = null;
function loadBangla() {
  loading ??= Promise.all([import('./bn'), import('date-fns/locale/bn')]).then(([dict, locale]) => {
    dictionary = dict.default;
    dateLocale = locale.bn;
    if (!document.getElementById('font-bangla')) {
      const link = document.createElement('link');
      link.id = 'font-bangla';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400..800&display=swap';
      document.head.appendChild(link);
    }
  });
  return loading;
}
// Start straight away for Bangla users, alongside the app's own code.
if (current === 'bn') loadBangla();

function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/**
 * Marks text kept in a list or constant that is translated later, where it
 * is shown, with t(). It returns the text unchanged; the dictionary test
 * finds it so the Bangla entry can't be forgotten.
 */
export const msg = (text: string) => text;

/** Translates outside React (toasts, helpers). Components use useT(). */
export function tr(text: string, vars?: Vars) {
  return fill((current === 'bn' && dictionary?.[text]) || text, vars);
}

/**
 * Fills {placeholders} in an already translated sentence with elements, so
 * styled parts stay styled whatever the word order:
 *   rich(t('{pct} of revenue from {name}'), { pct: <b>40%</b>, name })
 */
export function rich(text: string, parts: Record<string, ReactNode>) {
  return text.split(/(\{\w+\})/).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    return name && name in parts ? <Fragment key={i}>{parts[name]}</Fragment> : piece;
  });
}

/** date-fns locale for the current language; undefined means English. */
export function currentDateLocale() {
  return current === 'bn' ? dateLocale : undefined;
}

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: typeof tr;
}

const LanguageContext = createContext<LanguageContextValue>({ lang: 'en', setLang: () => {}, t: tr });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(current);
  const [ready, setReady] = useState(current === 'en' || dictionary !== null);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!ready) loadBangla().then(() => setReady(true), () => setReady(true));
  }, [ready]);

  const setLang = useCallback((next: Language) => {
    const apply = () => {
      current = next;
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
      setLangState(next);
    };
    if (next === 'bn') loadBangla().then(apply, apply);
    else apply();
  }, []);

  // A new t on every language change re-renders everything that uses it.
  const t = useCallback((text: string, vars?: Vars) => tr(text, vars), [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bangla users wait the few milliseconds for their words instead of
  // seeing English flash first.
  if (!ready) return null;

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}
