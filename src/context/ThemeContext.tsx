import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

export type FontStyle = 'inter' | 'poppins' | 'roboto' | 'playfair' | 'nunito' | 'dmsans';
export type ThemeName = 'purple';

export const FONT_FAMILIES: Record<FontStyle, string> = {
  inter: "'Inter', sans-serif",
  poppins: "'Poppins', sans-serif",
  roboto: "'Roboto', sans-serif",
  playfair: "'Playfair Display', serif",
  nunito: "'Nunito', sans-serif",
  dmsans: "'DM Sans', sans-serif",
};

export const FONT_LABELS: Record<FontStyle, string> = {
  inter: 'Inter',
  poppins: 'Poppins',
  roboto: 'Roboto',
  playfair: 'Playfair Display',
  nunito: 'Nunito',
  dmsans: 'DM Sans',
};

export interface ThemeColors {
  sidebar: string;
  pageBg: string;
  cards: string;
  chartCards: string;
  accent: string;
  darkBg: string;
}

export const THEMES: Record<ThemeName, { name: string; colors: ThemeColors }> = {
  purple: { name: 'Midnight Purple', colors: { sidebar: '#1E1B4B', pageBg: '#2D1B69', cards: '#160E3C', chartCards: '#E9D5FF', accent: '#A855F7', darkBg: '#0F0A2E' } },
};

const THEME_CLASSES: ThemeName[] = ['purple'];

function applyThemeClass(theme: ThemeName) {
  const root = document.documentElement;
  THEME_CLASSES.forEach(t => root.classList.remove(`theme-${t}`));
  root.classList.add(`theme-${theme}`);
}

function applyFont(font: FontStyle) {
  document.documentElement.style.fontFamily = FONT_FAMILIES[font];
}

// Apply before React renders to prevent flash
function applyFromStorage() {
  const dark = localStorage.getItem('lumina-dark') === 'true';
  const font = (localStorage.getItem('lumina-font') as FontStyle) || 'inter';
  const theme = (localStorage.getItem('lumina-theme') as ThemeName) || 'purple';
  document.documentElement.classList.toggle('dark', dark);
  applyFont(font);
  applyThemeClass(theme);
}
applyFromStorage();

interface ThemeContextType {
  isDark: boolean;
  fontStyle: FontStyle;
  themeName: ThemeName;
  toggleDark: () => void;
  setFontStyle: (f: FontStyle) => void;
  setThemeName: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { userSettings } = useAuth();
  const [isDark, setIsDark] = useState(() => localStorage.getItem('lumina-dark') === 'true');
  const [fontStyle, setFontStyleState] = useState<FontStyle>(
    () => (localStorage.getItem('lumina-font') as FontStyle) || 'inter'
  );
  const [themeName, setThemeNameState] = useState<ThemeName>(
    () => (localStorage.getItem('lumina-theme') as ThemeName) || 'purple'
  );

  useEffect(() => {
    if (userSettings?.dark_mode !== null && userSettings?.dark_mode !== undefined) {
      setIsDark(userSettings.dark_mode);
      localStorage.setItem('lumina-dark', String(userSettings.dark_mode));
      if (userSettings.dark_mode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [userSettings?.dark_mode]);

  const toggleDark = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      localStorage.setItem('lumina-dark', String(next));
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }, []);

  const setFontStyle = useCallback((f: FontStyle) => {
    setFontStyleState(f);
    localStorage.setItem('lumina-font', f);
    applyFont(f);
  }, []);

  const setThemeName = useCallback((t: ThemeName) => {
    setThemeNameState(t);
    localStorage.setItem('lumina-theme', t);
    applyThemeClass(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, fontStyle, themeName, toggleDark, setFontStyle, setThemeName }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
