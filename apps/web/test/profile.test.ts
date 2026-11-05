import { describe, expect, it } from 'vitest';
import { needsPhoneCompletion } from '../src/lib/profile.ts';

describe('needsPhoneCompletion', () => {
  it('is true for a signed in account without a phone', () => {
    expect(needsPhoneCompletion({ phone: '' })).toBe(true);
    expect(needsPhoneCompletion({ phone: '   ' })).toBe(true);
  });

  it('is false once the phone is there', () => {
    expect(needsPhoneCompletion({ phone: '9999-8888' })).toBe(false);
  });

  it('is false without a session', () => {
    expect(needsPhoneCompletion(null)).toBe(false);
    expect(needsPhoneCompletion(undefined)).toBe(false);
  });
});
