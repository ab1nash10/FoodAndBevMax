import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { renderScreen, reply } from '@/test/harness';
import { ThemeProvider, useTheme } from './theme-provider';
import { ThemeToggle } from './theme-toggle';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// The API calls the screen makes, each a typed stand-in.
type UserApi = typeof ApiModule.userApi;
const userApi = vi.hoisted(() => ({
  updateMyPreferences: vi.fn<UserApi['updateMyPreferences']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  userApi,
}));

let theme: ReturnType<typeof useTheme>;
function Probe() {
  theme = useTheme();
  return <p>{`${theme.theme} → ${theme.resolvedTheme}`}</p>;
}

const html = document.documentElement;

beforeEach(() => {
  vi.clearAllMocks();
  html.classList.remove('dark');
  userApi.updateMyPreferences.mockImplementation((body) => reply(body as never));
});

describe('the theme', () => {
  it('starts light, or as last chosen on this device', () => {
    localStorage.setItem('aahar-theme', 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByText('dark → dark')).toBeInTheDocument();
    expect(html).toHaveClass('dark');
  });

  it('follows the system when asked', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    act(() => theme.setTheme('system'));

    expect(screen.getByText('system → dark')).toBeInTheDocument();
    expect(localStorage.getItem('aahar-theme')).toBe('system');
    matchMedia.mockRestore();
  });

  it('refuses to work without the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Probe />)).toThrow('useTheme must be used within ThemeProvider');
  });
});

describe('the theme switch', () => {
  it('flips what is on screen and saves it to the account', async () => {
    const { user } = renderScreen(
      <ThemeProvider>
        <ThemeToggle />
        <Probe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    expect(html).toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
    expect(userApi.updateMyPreferences).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('keeps the switch on this device when the save fails', async () => {
    userApi.updateMyPreferences.mockRejectedValue(new Error('offline'));
    const { user } = renderScreen(
      <ThemeProvider>
        <ThemeToggle />
        <Probe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    expect(screen.getByText('dark → dark')).toBeInTheDocument();
  });
});
