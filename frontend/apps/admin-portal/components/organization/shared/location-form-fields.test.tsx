import type { LegalEntity } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen } from '@/test/harness';
import { LocationMasterFormFields } from './location-form-fields';
import { toHospitalFormDefaults } from './locations';
import type { HospitalFormValues } from './types';

type Client = typeof ApiModule.organizationApi;
const api = vi.hoisted(() => ({ listLegalEntities: vi.fn<Client['listLegalEntities']>() }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

// The edit panel: the form is drawn blank, then filled when the location arrives.
function FilledLater() {
  const form = useForm<HospitalFormValues>({ defaultValues: toHospitalFormDefaults() });

  return (
    <>
      <LocationMasterFormFields form={form} />
      <button
        onClick={() =>
          form.reset({ ...toHospitalFormDefaults(), city: 'New Delhi', state: 'Delhi' })
        }
        type="button"
      >
        Location arrives
      </button>
    </>
  );
}

describe('the location form', () => {
  it('shows the saved city once the location arrives, though its state’s cities came with it', async () => {
    api.listLegalEntities.mockImplementation(() => page([] as LegalEntity[]));
    const { user } = renderScreen(<FilledLater />);

    await user.click(screen.getByRole('button', { name: 'Location arrives' }));

    // Seen 2026-11-22: City read "Select city" for a location in New Delhi, as the city was set
    // before the Delhi cities were in the list.
    await waitFor(() => expect(screen.getByLabelText(/^City/)).toHaveValue('New Delhi'));
    expect(screen.getByLabelText(/^State/)).toHaveValue('Delhi');
  });
});
