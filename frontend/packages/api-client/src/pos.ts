import type { ListQuery } from './http';
import type { HospitalSummary } from './organization';

export type PrimaryUpiProvider =
  'BHARATPE' | 'GOOGLE_PAY' | 'OTHER' | 'PHONEPE' | 'UPI_BHARAT_QR' | 'UPI_PAYTM' | 'UPI_SALE';

export interface PosDeviceRestaurantSummary {
  id: string;
  isActive: boolean;
  restaurantCode: string;
  restaurantName: string;
}

export interface PosDevice {
  code: string;
  createdAt: string;
  deletedAt: string | null;
  entity: string | null;
  hostName: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  isActive: boolean;
  isInvoicePrintEnabled: boolean;
  isKotPrintEnabled: boolean;
  name: string;
  restaurantIds: string[];
  restaurants: PosDeviceRestaurantSummary[];
  updatedAt: string;
}

export interface PosDeviceInput {
  code: string;
  entity?: string;
  hospitalId: string;
  hostName?: string;
  isActive?: boolean;
  isInvoicePrintEnabled?: boolean;
  isKotPrintEnabled?: boolean;
  name: string;
  restaurantIds?: string[];
}

export interface PosDeviceListQuery extends ListQuery {
  hospitalId?: string;
  hostName?: string;
  restaurantId?: string;
}

export interface PaymentMachine {
  createdAt: string;
  deletedAt: string | null;
  hasPinelabSecurityToken: boolean;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  isActive: boolean;
  isDefault: boolean;
  name: string;
  pinelabImei: string | null;
  pinelabMerchantId: string | null;
  pinelabMerchantStorePosCode: string | null;
  pinelabSecurityToken: string | null;
  posDevice: Pick<PosDevice, 'code' | 'id' | 'isActive' | 'name'>;
  posDeviceId: string;
  primaryUpi: PrimaryUpiProvider | null;
  serialNumber: string | null;
  updatedAt: string;
}

export interface PaymentMachineInput {
  hospitalId: string;
  isActive?: boolean;
  isDefault?: boolean;
  name: string;
  pinelabImei?: string;
  pinelabMerchantId?: string;
  pinelabMerchantStorePosCode?: string;
  pinelabSecurityToken?: string;
  posDeviceId: string;
  primaryUpi?: PrimaryUpiProvider;
  serialNumber?: string;
}

export interface PaymentMachineListQuery extends ListQuery {
  hospitalId?: string;
  isDefault?: boolean;
  posDeviceId?: string;
  primaryUpi?: PrimaryUpiProvider;
}
