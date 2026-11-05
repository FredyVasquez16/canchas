import { describe, expect, it } from 'vitest';
import { resetTokenFromHash } from '../src/lib/recovery.ts';

describe('resetTokenFromHash', () => {
  it('reads the token from the recovery link', () => {
    expect(resetTokenFromHash('#/nueva-clave?token=abc123')).toBe('abc123');
    expect(resetTokenFromHash('#/nueva-clave?token=Zm9vYmFy_-1')).toBe('Zm9vYmFy_-1');
  });

  it('accepts the link with no hash mark, as the router also does', () => {
    expect(resetTokenFromHash('/nueva-clave?token=abc123')).toBe('abc123');
  });

  it('decodes a token that travelled percent-encoded', () => {
    expect(resetTokenFromHash('#/nueva-clave?token=a%20b')).toBe('a b');
  });

  it('returns null when there is no token to read', () => {
    expect(resetTokenFromHash('')).toBeNull();
    expect(resetTokenFromHash('#/nueva-clave')).toBeNull();
    expect(resetTokenFromHash('#/nueva-clave?token=')).toBeNull();
    expect(resetTokenFromHash('#/nueva-clave?token=%20%20')).toBeNull();
    expect(resetTokenFromHash('#/nueva-clave?otro=abc')).toBeNull();
  });

  it('ignores the parameter on another screen', () => {
    expect(resetTokenFromHash('#/entrar?token=abc123')).toBeNull();
    expect(resetTokenFromHash('#/?token=abc123')).toBeNull();
  });
});
