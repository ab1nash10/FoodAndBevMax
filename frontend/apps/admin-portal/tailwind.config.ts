import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

// Theme-aware tokens are CSS variables (see globals.css) so dark mode keeps working.
const themed = (name: string) => `rgb(var(--ds-${name}) / <alpha-value>)`;

const config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  darkMode: ['class'],
  plugins: [tailwindcssAnimate],
  theme: {
    // Tailwind's defaults plus `nav` (900px), where the sidebar stops being a drawer. Listed in
    // full so the breakpoints stay in ascending order.
    screens: {
      sm: '640px',
      md: '768px',
      nav: '900px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      borderRadius: {
        card: '16px',
        control: '10px',
        'control-lg': '12px',
        tile: '14px',
      },
      colors: {
        background: 'hsl(var(--background))',
        border: 'hsl(var(--border))',
        foreground: 'hsl(var(--foreground))',
        // Older names, now pointing at the design tokens below.
        brand: {
          blue: '#0B57A4',
          danger: '#B4233F',
          emerald: '#0F7B63',
          info: '#0B57A4',
          mint: '#E7F6F1',
          navy: '#0F172A',
          teal: '#0F7B63',
          warning: '#F59E0B',
        },
        // Design tokens from the UI concepts. Add no colours outside this set.
        ds: {
          border: themed('border'),
          divider: themed('divider'),
          food: { egg: '#B45309', 'egg-dot': '#F59E0B', 'non-veg': '#9A3412', veg: '#15803D' },
          input: themed('input'),
          link: themed('link'),
          muted: themed('muted'),
          page: themed('page'),
          pending: { bg: '#FEF3C7', fg: '#92400E' },
          primary: { DEFAULT: '#0B57A4', hover: '#094A8C', soft: themed('primary-soft') },
          received: { bg: '#E3F5EE', fg: '#0F6B55' },
          rejected: { bg: '#FDECEF', fg: '#B4233F' },
          selected: themed('selected'),
          stage: {
            dispatched: '#0B57A4',
            late: '#C0264B',
            preparing: '#F59E0B',
            queued: '#94A3B8',
            ready: '#0F7B63',
          },
          subtle: themed('subtle'),
          'subtle-2': themed('subtle-2'),
          surface: themed('surface'),
          teal: {
            DEFAULT: '#0F7B63',
            border: themed('teal-border'),
            deep: '#0F5E4C',
            soft: themed('teal-soft'),
            text: themed('teal-text'),
          },
          text: { DEFAULT: themed('text'), 2: themed('text-2'), 3: themed('text-3') },
          tile: {
            employees: { bg: '#FDECEF', fg: '#C0264B' },
            items: { bg: '#EAF1FD', fg: '#1D5FC9' },
            kitchens: { bg: '#FFF4E6', fg: '#C2570C' },
            locations: { bg: '#E7F6F1', fg: '#0F7B63' },
            restaurants: { bg: '#F3EEFF', fg: '#6D3FD1' },
            stores: { bg: '#E3F5EE', fg: '#15803D' },
          },
          transit: { bg: '#E8F0FA', fg: '#0B57A4' },
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        content: '1360px',
      },
      spacing: {
        control: '40px',
        cta: '42px',
        sidebar: '272px',
      },
    },
  },
} satisfies Config;

export default config;
