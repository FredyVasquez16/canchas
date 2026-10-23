import { describe, expect, it } from 'vitest';
import { isValidHonduranPhone, normalizePhone } from '../src/phone.ts';

describe('normalizePhone', () => {
  it('adds the country code to an eight digit local number', () => {
    expect(normalizePhone('9999-8888')).toBe('50499998888');
  });

  it('keeps an already international number and strips separators', () => {
    expect(normalizePhone('+504 9999 8888')).toBe('50499998888');
  });

  it('treats formatting variants as the same phone, so a block cannot be evaded', () => {
    const variants = ['9999 8888', '99998888', '+50499998888', '(504) 9999-8888'];
    const normalized = new Set(variants.map((value) => normalizePhone(value)));
    expect(normalized.size).toBe(1);
  });
});

describe('isValidHonduranPhone', () => {
  it('accepts a valid mobile number', () => {
    expect(isValidHonduranPhone('9999-8888')).toBe(true);
  });

  it.each(['1234', '', 'abc', '504-12'])('rejects %s', (value) => {
    expect(isValidHonduranPhone(value)).toBe(false);
  });
});
