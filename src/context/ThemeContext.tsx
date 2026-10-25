import React, { createContext, useContext, useState, useCallback } from 'react';

export type FontStyle = 'inter' | 'poppins' | 'roboto' | 'playfair' | 'nunito' | 'dmsans';

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

function applyFont(font: FontStyle) {
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
