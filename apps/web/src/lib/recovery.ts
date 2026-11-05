/**
 * S31: the recovery link is `#/nueva-clave?token=...`. Reading it here keeps the parsing in
 * one pure place, so the screen never guesses whether a token is present.
 */
const RESET_ROUTE = 'nueva-clave';

export function resetTokenFromHash(hash: string): string | null {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const [path = '', rawQuery = ''] = withoutHash.split('?');
  const route = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (route !== RESET_ROUTE) {
    return null;
  }
  const token = (new URLSearchParams(rawQuery).get('token') ?? '').trim();
  return token === '' ? null : token;
}
