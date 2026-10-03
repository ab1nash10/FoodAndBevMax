'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** The user's setting. 'system' follows the operating system's light/dark mode. */
type Theme = 'dark' | 'light' | 'system';
/** What is actually on screen. */
type ResolvedTheme = 'dark' | 'light';

interface ThemeContextValue {
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = 'aahar-theme';
const darkQuery = '(prefers-color-scheme: dark)';

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== 'system') {
    return theme;
  }

  return window.matchMedia(darkQuery).matches ? 'dark' : 'light';
}

function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;

  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(storageKey);
    const initialTheme: Theme =
      storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'system'
        ? storedTheme
        : 'light';
    const resolved = resolveTheme(initialTheme);

    setThemeState(initialTheme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  // While following the system, switch live when the operating system changes mode.
  useEffect(() => {
    if (theme !== 'system') {
      return;
    }

    const media = window.matchMedia(darkQuery);
    const onChange = () => {
      const resolved = resolveTheme('system');
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };

    media.addEventListener('change', onChange);

    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = (nextTheme: Theme) => {
    const resolved = resolveTheme(nextTheme);

    setThemeState(nextTheme);
    setResolvedTheme(resolved);
    window.localStorage.setItem(storageKey, nextTheme);
    applyTheme(resolved);
  };

  const value = useMemo(
    () => ({
      resolvedTheme,
      setTheme,
      theme,
      // The header button flips what is on screen, which also leaves "Match system" mode.
      toggleTheme: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    }),
    [resolvedTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
