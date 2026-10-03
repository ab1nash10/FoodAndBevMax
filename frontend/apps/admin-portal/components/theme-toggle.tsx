'use client';

import { Button } from '@aahar/ui';
import { Moon, Sun } from 'lucide-react';
import { useSavePreferences } from '@/components/preferences/use-preferences';
import { useTheme } from '@/components/theme-provider';

export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const savePreferences = useSavePreferences();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="text-ds-text-2"
      onClick={() => {
        toggleTheme();
        // Remembered on the account too, so other devices follow. A failed save only means
        // this device keeps the switch locally, as before Preferences existed.
        savePreferences.mutate({ theme: isDark ? 'light' : 'dark' });
      }}
      size="icon"
      type="button"
      variant="outline"
    >
      {isDark ? (
        <Sun className="h-[18px] w-[18px]" strokeWidth={1.8} />
      ) : (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      )}
    </Button>
  );
}
