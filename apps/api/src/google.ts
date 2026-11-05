import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * S36: Google sign-in stays off until the venue supplies its own OAuth client. Both values
 * are required: a half-configured client would fail in front of a client.
 */
export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export const GOOGLE_AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
export const GOOGLE_SCOPE = 'openid email profile';
export const GOOGLE_STATE_MAX_AGE_SECONDS = 600;

export const DEFAULT_GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';

export function googleConfigFromEnv(env: NodeJS.ProcessEnv): GoogleConfig | null {
  const clientId = (env.GOOGLE_CLIENT_ID ?? '').trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET ?? '').trim();
  if (clientId === '' || clientSecret === '') {
    return null;
  }
  const redirectUri = (env.GOOGLE_REDIRECT_URI ?? '').trim() || DEFAULT_GOOGLE_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}

export function googleAuthorizeUrl(config: GoogleConfig, state: string): string {
  const url = new URL(GOOGLE_AUTHORIZE_ENDPOINT);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPE);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);
  return url.toString();
}

/** S39: the state names a nonce, its issue time and a signature only this secret produces. */
function signState(secret: string, nonce: string, issuedAt: number): string {
  return createHmac('sha256', secret)
    .update(`google-state:${nonce}:${issuedAt}`)
    .digest('base64url');
}

export function createGoogleState(secret: string, now: number): string {
  const nonce = randomBytes(16).toString('base64url');
  return `${nonce}.${now}.${signState(secret, nonce, now)}`;
}

/**
 * S39: a state that carries its own issue time dies on the server after ten minutes, so a
 * retained cookie cannot be replayed later even though the signature is still valid.
 */
export function isValidGoogleState(secret: string, state: string, now: number): boolean {
  const parts = state.split('.');
  if (parts.length !== 3) {
    return false;
  }
  const [nonce = '', issuedAtRaw = '', signature = ''] = parts;
  if (nonce === '' || signature === '') {
    return false;
  }
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) {
    return false;
  }
  const age = now - issuedAt;
  if (age < 0 || age > GOOGLE_STATE_MAX_AGE_SECONDS * 1000) {
    return false;
  }
  const expected = Buffer.from(signState(secret, nonce, issuedAt));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function googleStateCookie(value: string): string {
  return `oauth_state=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${GOOGLE_STATE_MAX_AGE_SECONDS}`;
}

export const CLEAR_GOOGLE_STATE_COOKIE = 'oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

/** S37: a profile is only usable when Google itself confirmed the email. */
export class GoogleExchangeError extends Error {
  constructor(
    readonly step: 'token' | 'profile',
    message: string,
  ) {
    super(message);
    this.name = 'GoogleExchangeError';
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * S37: the code is exchanged on the server, so the client secret and the access token never
 * travel through the browser.
 */
export async function fetchGoogleProfile(
  config: GoogleConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleProfile> {
  const tokenResponse = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new GoogleExchangeError('token', `token endpoint answered ${tokenResponse.status}`);
  }
  const tokens = jsonObject(await tokenResponse.json());
  const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : '';
  if (accessToken === '') {
    throw new GoogleExchangeError('token', 'token endpoint returned no access token');
  }

  const profileResponse = await fetchImpl(GOOGLE_USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!profileResponse.ok) {
    throw new GoogleExchangeError('profile', `userinfo answered ${profileResponse.status}`);
  }
  const info = jsonObject(await profileResponse.json());

  const googleId = typeof info.sub === 'string' ? info.sub.trim() : '';
  const email = typeof info.email === 'string' ? info.email.trim().toLowerCase() : '';
  if (googleId === '' || email === '') {
    throw new GoogleExchangeError('profile', 'userinfo returned no subject or email');
  }

  const rawName = typeof info.name === 'string' ? info.name.trim() : '';
  return {
    googleId,
    email,
    name: rawName === '' ? email : rawName,
    emailVerified: info.email_verified === true || info.email_verified === 'true',
  };
}
