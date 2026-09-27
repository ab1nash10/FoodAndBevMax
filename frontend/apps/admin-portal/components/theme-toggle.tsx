'use client';

import { Button } from '@aahar/ui';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="border-slate-200 bg-white text-brand-navy shadow-sm shadow-slate-900/5 hover:border-brand-blue/30 hover:bg-brand-mint hover:text-brand-blue dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
      onClick={toggleTheme}
      size="icon"
      type="button"
      variant="outline"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
