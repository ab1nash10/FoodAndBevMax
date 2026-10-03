/** Window event the command palette listens for; anything can open it without shared state. */
export const OPEN_COMMAND_PALETTE_EVENT = 'aahar:open-command-palette';

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}
