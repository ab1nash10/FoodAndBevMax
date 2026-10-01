import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The portal's custom radius, size and width tokens (admin-portal tailwind.config.ts), so a
// className passed to a component replaces them instead of both classes being kept.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      container: ['content'],
      radius: ['card', 'control', 'control-lg', 'tile'],
      spacing: ['control', 'cta', 'sidebar'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
