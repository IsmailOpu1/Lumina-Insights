import React, { createContext, useContext, useState, useCallback } from 'react';

export type FontStyle = 'inter' | 'poppins' | 'roboto' | 'playfair' | 'nunito' | 'dmsans';
export type ThemeName = 'avocado' | 'ocean' | 'sunset' | 'purple' | 'forest' | 'rosegold';

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
  avocado: { name: 'Avocado', colors: { sidebar: '#7a8e57', pageBg: '#374b2f', cards: '#000000', chartCards: '#dcd38e', accent: '#F0B429', darkBg: '#141E14' } },
  ocean: { name: 'Ocean Deep', colors: { sidebar: '#1B3A4B', pageBg: '#1E3F5A', cards: '#0D1B2A', chartCards: '#B8D4E8', accent: '#00B4D8', darkBg: '#0A1628' } },
  sunset: { name: 'Sunset', colors: { sidebar: '#6B2D2D', pageBg: '#7A3535', cards: '#1A0A0A', chartCards: '#F4C9A0', accent: '#FF6B35', darkBg: '#1A0A0A' } },
  purple: { name: 'Midnight Purple', colors: { sidebar: '#2D1B4E', pageBg: '#341E5C', cards: '#160D2E', chartCards: '#D4C4F0', accent: '#9B59B6', darkBg: '#0D0820' } },
  forest: { name: 'Forest Night', colors: { sidebar: '#1A3A2A', pageBg: '#1E4030', cards: '#0A1A10', chartCards: '#C0DCC0', accent: '#27AE60', darkBg: '#0A1510' } },
  rosegold: { name: 'Rose Gold', colors: { sidebar: '#5C3A3A', pageBg: '#6B4040', cards: '#1A0A0A', chartCards: '#F0D4D4', accent: '#E8A0A0', darkBg: '#1A0808' } },
};

const THEME_CLASSES: ThemeName[] = ['avocado', 'ocean', 'sunset', 'purple', 'forest', 'rosegold'];

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
  const theme = (localStorage.getItem('lumina-theme') as ThemeName) || 'avocado';
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
  const [isDark, setIsDark] = useState(() => localStorage.getItem('lumina-dark') === 'true');
  const [fontStyle, setFontStyleState] = useState<FontStyle>(
    () => (localStorage.getItem('lumina-font') as FontStyle) || 'inter'
  );
  const [themeName, setThemeNameState] = useState<ThemeName>(
    () => (localStorage.getItem('lumina-theme') as ThemeName) || 'avocado'
  );

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
