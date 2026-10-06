'use client';

import type {
  Hospital as HospitalRecord,
  HospitalInput,
  OnlinePaymentOption,
} from '@aahar/api-client';
import type {
  HospitalFormValues,
  LocationDisplaySource,
} from '@/components/organization/shared/types';
import { optionalValue } from '@/components/organization/shared/utils';

export const freezeServicesMessage =
  'Turning this off will freeze related services. Existing records will remain visible. Continue?';

export const inactiveLocationMessage =
  'This Location is inactive. Services for this Location are currently frozen.';

export function getLocationTitle(hospital: LocationDisplaySource): string {
  return hospital.title ?? hospital.hospitalName;
}

export function getLocationCode(hospital: LocationDisplaySource): string {
  return hospital.locationCode ?? hospital.hospitalCode;
}

export function getLocationDisplayName(hospital: LocationDisplaySource): string {
  return hospital.displayName ?? getLocationTitle(hospital);
}

function getLocationInvoicePrefix(hospital: LocationDisplaySource): string | null {
  return hospital.invoicePrefix ?? hospital.billPrefix ?? null;
}

export function getLocationPostalCode(hospital: LocationDisplaySource): string | null {
  return hospital.postalCode ?? null;
}

export function formatLocationOption(hospital: LocationDisplaySource): string {
  const code = getLocationCode(hospital);
  const stateAndPostal = [hospital.state, getLocationPostalCode(hospital)]
    .filter(Boolean)
    .join('-');
  const locationDetails = [hospital.city, stateAndPostal || undefined].filter(Boolean).join(', ');

  return `${code} - ${getLocationTitle(hospital)}${
    locationDetails ? `, ${locationDetails}` : ''
  } (${code})`;
}

export function formatRestaurantLocationDisplay(
  hospital: LocationDisplaySource | null | undefined,
): string {
  if (!hospital) {
    return 'Location not set';
  }

  const code = getLocationCode(hospital);
  const stateAndPostal = [hospital.state, getLocationPostalCode(hospital)]
    .filter(Boolean)
    .join('-');
  const locationDetails = [hospital.city, stateAndPostal || undefined].filter(Boolean).join(', ');
  const primaryText = [code, getLocationDisplayName(hospital)].filter(Boolean).join(' - ');

  return (
    [primaryText, locationDetails || undefined].filter(Boolean).join(', ') || 'Location not set'
  );
}

export function toHospitalFormDefaults(hospital?: HospitalRecord): HospitalFormValues {
  return {
    address: hospital?.address ?? '',
    area: hospital?.area ?? '',
    city: hospital?.city ?? '',
    displayName: hospital ? getLocationDisplayName(hospital) : '',
    invoicePrefix: hospital ? (getLocationInvoicePrefix(hospital) ?? '') : '',
    ipAddress: hospital?.ipAddress ?? '',
    isActive: hospital?.isActive ?? true,
    latitude: hospital?.latitude ?? '',
    locationCode: hospital ? getLocationCode(hospital) : '',
    longitude: hospital?.longitude ?? '',
    onlinePaymentOption: hospital?.onlinePaymentOption ?? 'NONE',
    postalCode: hospital ? (getLocationPostalCode(hospital) ?? '') : '',
    state: hospital?.state ?? '',
    title: hospital ? getLocationTitle(hospital) : '',
    visitingCardAddress: hospital?.visitingCardAddress ?? '',
  };
}

export function toHospitalInput(values: HospitalFormValues): HospitalInput {
  const invoicePrefix = optionalValue(values.invoicePrefix);
  const locationCode = values.locationCode.trim();
  const title = values.title.trim();

  return {
    address: values.address.trim(),
    area: optionalValue(values.area),
    billPrefix: invoicePrefix,
    city: values.city.trim(),
    displayName: values.displayName.trim(),
    hospitalCode: locationCode,
    hospitalName: title,
    invoicePrefix,
    ipAddress: optionalValue(values.ipAddress),
    isActive: values.isActive,
    latitude: optionalValue(values.latitude),
    locationCode,
    longitude: optionalValue(values.longitude),
    onlinePaymentOption: values.onlinePaymentOption,
    postalCode: optionalValue(values.postalCode),
    state: values.state.trim(),
    title,
    visitingCardAddress: optionalValue(values.visitingCardAddress),
  };
}

export function formatRestaurantLocationOption(hospital: HospitalRecord): string {
  return formatLocationOption(hospital);
}

export const onlinePaymentOptions: Array<{ label: string; value: OnlinePaymentOption }> = [
  { label: 'None', value: 'NONE' },
  { label: 'PayU', value: 'PAYU' },
  { label: 'RazorPay', value: 'RAZORPAY' },
];
