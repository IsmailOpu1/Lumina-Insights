import React, { createContext, useContext, useState, useCallback } from 'react';

export type FontStyle = 'inter' | 'poppins' | 'roboto' | 'playfair' | 'nunito' | 'dmsans';

// Bangla letters fall back to Noto Sans Bengali, loaded with the Bangla interface.
const BANGLA = "'Noto Sans Bengali'";

export const FONT_FAMILIES: Record<FontStyle, string> = {
  inter: `'Inter', ${BANGLA}, sans-serif`,
  poppins: `'Poppins', ${BANGLA}, sans-serif`,
  roboto: `'Roboto', ${BANGLA}, sans-serif`,
  playfair: `'Playfair Display', ${BANGLA}, serif`,
  nunito: `'Nunito', ${BANGLA}, sans-serif`,
  dmsans: `'DM Sans', ${BANGLA}, sans-serif`,
};

export const FONT_LABELS: Record<FontStyle, string> = {
  inter: 'Inter',
  poppins: 'Poppins',
  roboto: 'Roboto',
  playfair: 'Playfair Display',
  nunito: 'Nunito',
  dmsans: 'DM Sans',
};

// Google Fonts names; Inter is already in index.html.
const FONT_QUERIES: Record<Exclude<FontStyle, 'inter'>, string> = {
  poppins: 'Poppins:wght@400;500;600;700;800',
  roboto: 'Roboto:wght@400;500;600;700;800',
  playfair: 'Playfair+Display:wght@400;500;600;700',
  nunito: 'Nunito:wght@400;500;600;700;800',
  dmsans: 'DM+Sans:wght@400;500;600;700;800',
};

/** Downloads a font the first time it's needed instead of on every visit. */
export function loadFont(font: FontStyle) {
  if (font === 'inter' || !FONT_QUERIES[font]) return;
  const id = `font-${font}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${FONT_QUERIES[font]}&display=swap`;
  document.head.appendChild(link);
}

function applyFont(font: FontStyle) {
  if (!FONT_FAMILIES[font]) return;
  loadFont(font);
  document.documentElement.style.fontFamily = FONT_FAMILIES[font];
}

// Lumina is dark only; apply the font before React renders to prevent a flash.
function applyFromStorage() {
  document.documentElement.classList.add('dark');
  const font = (localStorage.getItem('lumina-font') as FontStyle) || 'inter';
  applyFont(font);
}
applyFromStorage();

interface ThemeContextType {
  fontStyle: FontStyle;
  setFontStyle: (f: FontStyle) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [fontStyle, setFontStyleState] = useState<FontStyle>(
    () => (localStorage.getItem('lumina-font') as FontStyle) || 'inter'
  );

  const setFontStyle = useCallback((f: FontStyle) => {
    setFontStyleState(f);
    localStorage.setItem('lumina-font', f);
    applyFont(f);
  }, []);

  return (
    <ThemeContext.Provider value={{ fontStyle, setFontStyle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
