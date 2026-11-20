import { ApiClientError } from '@aahar/api-client';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, reply } from '@/test/harness';
import { atLocation, ppg, saket } from '@/test/location';
import { PosGate } from './pos-gate';
import type * as ApiModule from '@/lib/api';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  enrollTill: vi.fn<Client['enrollTill']>(),
  posWhoAmI: vi.fn<Client['posWhoAmI']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

type WhoAmI = Awaited<ReturnType<Client['posWhoAmI']>>['data'];
const till = (patch: Partial<WhoAmI> = {}): WhoAmI => ({
  allowed: true,
  hospitalIds: [ppg.id],
  restaurants: ['Cafe Max'],
  till: 'PPG Till 1',
  ...patch,
});

const gate = (
  <PosGate>
    <p>Billing</p>
  </PosGate>
);

beforeEach(() => {
  vi.clearAllMocks();
  atLocation(ppg);
  api.posWhoAmI.mockImplementation(() => reply(till()));
});

describe('the POS gate', () => {
  it('opens the till for an assigned user at the till’s location', async () => {
    window.localStorage.setItem('aahar.pos.tillKey', 'key-1');
    renderScreen(gate);

    expect(await screen.findByText('Billing')).toBeInTheDocument();
    // The browser's key is how the server knows which till this is.
    expect(api.posWhoAmI).toHaveBeenCalledWith('key-1');
  });

  it('opens the till with All locations picked', async () => {
    atLocation(null);
    renderScreen(gate);

    expect(await screen.findByText('Billing')).toBeInTheDocument();
  });

  it('asks for the computer’s name on a computer that is no till yet', async () => {
    api.posWhoAmI.mockImplementation(() => reply(till({ allowed: false, till: null })));
    renderScreen(gate);

    expect(
      await screen.findByText(
        'This computer is not set up as a till yet. Type its name to open the POS here.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open POS' })).toBeDisabled();
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
  });

  it('sets the computer up as a till with the name typed, then opens the POS', async () => {
    api.posWhoAmI.mockImplementation(() => reply(till({ allowed: false, till: null })));
    api.enrollTill.mockImplementation(() => reply({ tillKey: 'new-key' }));
    const { user } = renderScreen(gate);

    await user.type(await screen.findByLabelText('This computer’s name'), '  HO-LAP-1651 ');
    api.posWhoAmI.mockImplementation(() => reply(till()));
    await user.click(screen.getByRole('button', { name: 'Open POS' }));

    expect(api.enrollTill).toHaveBeenCalledWith('HO-LAP-1651');
    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(window.localStorage.getItem('aahar.pos.tillKey')).toBe('new-key');
    expect(api.posWhoAmI).toHaveBeenLastCalledWith('new-key');
  });

  it('shows why a computer name was refused', async () => {
    api.posWhoAmI.mockImplementation(() => reply(till({ allowed: false, till: null })));
    api.enrollTill.mockRejectedValue(
      new ApiClientError(404, 'No POS device lists you with this computer.'),
    );
    const { user } = renderScreen(gate);

    await user.type(await screen.findByLabelText('This computer’s name'), 'HO-LAP-9999{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No POS device lists you with this computer.',
    );
    expect(window.localStorage.getItem('aahar.pos.tillKey')).toBeNull();
  });

  it('opens by itself with the name the till launcher passed', async () => {
    window.localStorage.setItem('aahar.pos.computerName', 'HO-LAP-1651');
    api.posWhoAmI.mockImplementation(() => reply(till({ allowed: false, till: null })));
    api.enrollTill.mockImplementation(() => reply({ tillKey: 'new-key' }));
    renderScreen(gate);

    await vi.waitFor(() => expect(api.enrollTill).toHaveBeenCalledWith('HO-LAP-1651'));
    expect(api.enrollTill).toHaveBeenCalledTimes(1);
  });

  it('keeps the POS closed for a user not assigned to the till’s location, offering to move it', async () => {
    window.localStorage.setItem('aahar.pos.computerName', 'HO-LAP-1651');
    api.posWhoAmI.mockImplementation(() => reply(till({ allowed: false })));
    renderScreen(gate);

    expect(
      await screen.findByText(
        /You are not assigned to the location of this till’s restaurant \(Cafe Max\)/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Is this computer now a till somewhere else\?/)).toBeInTheDocument();
    // Being moved: the launcher's name would only be refused again, so nothing is sent by itself.
    expect(api.enrollTill).not.toHaveBeenCalled();
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
  });

  it('says which location to pick when the till is at another one', async () => {
    atLocation(saket);
    renderScreen(gate);

    expect(
      await screen.findByText(
        'This till is at Patparganj, and you have Saket picked. Pick Patparganj at the top to use the POS here.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
  });

  it('shows the server’s refusal, with nothing to set up', async () => {
    api.posWhoAmI.mockRejectedValue(new ApiClientError(403, 'You may not use the POS.'));
    renderScreen(gate);

    expect(await screen.findByText('You may not use the POS.')).toBeInTheDocument();
    expect(screen.queryByLabelText('This computer’s name')).not.toBeInTheDocument();
  });
});
