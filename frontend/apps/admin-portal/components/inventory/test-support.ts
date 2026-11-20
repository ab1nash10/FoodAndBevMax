// Shared by the inventory and kitchen screen tests.
import { configure } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

// These screens wait on several requests before they show anything, and the suite runs its files
// side by side: on a busy machine that outlasts Testing Library's 1 s wait and Vitest's 5 s test.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : never;
};

/**
 * An API client mocked with vi.mock('@/lib/api', …), typed as plain mock functions so a test can
 * hand one to expect() (a client method is typed as a method, and lint stops a method being
 * passed around away from its object).
 */
export const mockedApi = <T extends object>(client: T) => client as unknown as Mocked<T>;
