import { POS_COMPUTER_NAME_KEY, POS_WINDOW_KEY } from './auth-storage';

/**
 * The till launcher (scripts/pos-launcher.cmd) opens the POS at `…?pc=%COMPUTERNAME%`, because
 * a browser cannot read the computer's name itself. It is saved on the first page load, before
 * sign-in redirects the address away: the name fills in the till setup, and the window opens
 * Billing after every sign-in. A typed `?pc=` is no stronger than typing the name in the gate.
 */
export function rememberPosLaunch(): void {
  try {
    const computerName = new URLSearchParams(window.location.search).get('pc')?.trim();

    if (!computerName) return;

    window.localStorage.setItem(POS_COMPUTER_NAME_KEY, computerName);
    window.sessionStorage.setItem(POS_WINDOW_KEY, '1');
  } catch {
    // Storage blocked: the cashier types the name, as before.
  }
}

/** The computer name the launcher passed, or '' when it was opened some other way. */
export function launchedComputerName(): string {
  try {
    return window.localStorage.getItem(POS_COMPUTER_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** The installed POS app (app/pos-app.webmanifest) or a window the launcher opened. */
export function isPosWindow(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.sessionStorage.getItem(POS_WINDOW_KEY) === '1'
    );
  } catch {
    return false;
  }
}
