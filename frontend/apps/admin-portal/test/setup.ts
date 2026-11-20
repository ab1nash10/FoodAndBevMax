// Every test file: jest-dom's matchers (toBeVisible, toHaveValue…). In component tests (jsdom),
// the screen is cleared after each test, and the browser APIs jsdom leaves out are stood in for.
/* eslint-disable @typescript-eslint/unbound-method -- `x.method ??=` only checks whether jsdom has it */
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

if (typeof document !== 'undefined') {
  const { cleanup, configure } = await import('@testing-library/react');
  // findBy…/waitFor give a loading screen 3 s, not 1 s: busy machines are slower than a laptop.
  configure({ asyncUtilTimeout: 3_000 });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  window.matchMedia ??= (query: string) =>
    ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }) as MediaQueryList;

  class NoObserver {
    disconnect() {}
    observe() {}
    takeRecords() {
      return [];
    }
    unobserve() {}
  }
  globalThis.ResizeObserver ??= NoObserver as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver ??= NoObserver as unknown as typeof IntersectionObserver;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  Element.prototype.scrollTo ??= function scrollTo() {};
  window.scrollTo = () => undefined;
  globalThis.CSS ??= {} as typeof CSS;
  CSS.escape ??= (value: string) => value.replace(/["\\]/g, '\\$&');

  // <dialog>: jsdom keeps the element but not its modal methods.
  const dialog = HTMLDialogElement.prototype;
  dialog.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  dialog.show ??= function show(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  dialog.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };

  // Screens that print or download reach for these; nothing opens in a test.
  window.print = vi.fn();
  URL.createObjectURL ??= () => 'blob:test';
  URL.revokeObjectURL ??= () => undefined;
}
