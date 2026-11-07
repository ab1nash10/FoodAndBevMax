import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, test } from 'vitest';
import { CreatePaymentMachineDto } from './create-payment-machine.dto';

const base = {
  hospitalId: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80',
  name: 'Pine Labs Terminal 1',
  posDeviceId: '23f9a533-5456-42a5-a926-28084c5f6d4f',
};
const failing = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(CreatePaymentMachineDto, { ...base, ...body })).map(
    (error) => error.property,
  );

describe('payment machine fields', () => {
  test('serial number, merchant id and store POS code are digits only', () => {
    expect(
      failing({
        pinelabMerchantId: '216344',
        pinelabMerchantStorePosCode: '473174498',
        serialNumber: '1491325569',
      }),
    ).toEqual([]);
    expect(
      failing({
        pinelabMerchantId: 'M-1',
        pinelabMerchantStorePosCode: '47 31',
        serialNumber: 'SN1',
      }),
    ).toEqual(['serialNumber', 'pinelabMerchantId', 'pinelabMerchantStorePosCode']);
  });

  test('the IMEI takes letters, numbers and hyphens', () => {
    expect(failing({ pinelabImei: 'IMEI-0011' })).toEqual([]);
    expect(failing({ pinelabImei: 'IMEI 0011' })).toEqual(['pinelabImei']);
  });

  test('an empty string is allowed so a saved value can be cleared', () => {
    expect(
      failing({
        pinelabImei: '',
        pinelabMerchantId: '',
        pinelabMerchantStorePosCode: '',
        serialNumber: '',
      }),
    ).toEqual([]);
  });

  test('the primary UPI must be a known provider', () => {
    expect(failing({ primaryUpi: 'NOT_A_PROVIDER' })).toEqual(['primaryUpi']);
  });
});
