import { COUNTRY_CODE } from './config.ts';

/**
 * Reduces a phone number to digits, adding the country code to a local number.
 * Every path that stores or compares a phone uses this, so formatting variants
 * of the same number cannot be used to evade a block (S11).
 */
export function normalizePhone(raw: string, countryCode: string = COUNTRY_CODE): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${countryCode}${digits}`;
  }
  return digits;
}

export function isValidHonduranPhone(raw: string): boolean {
  return /^504\d{8}$/.test(normalizePhone(raw));
}
