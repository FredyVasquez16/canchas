/**
 * Venue identity. Everything here comes from build-time environment variables so the
 * same code serves another complex without editing components.
 */
export const VENUE_NAME = (import.meta.env.VITE_VENUE_NAME as string | undefined) ?? 'Canchas';
export const VENUE_PHONE = (import.meta.env.VITE_VENUE_PHONE as string | undefined) ?? '';
export const VENUE_EMAIL = (import.meta.env.VITE_VENUE_EMAIL as string | undefined) ?? '';
export const VENUE_CITY = (import.meta.env.VITE_VENUE_CITY as string | undefined) ?? '';
export const VENUE_PHONE_DIGITS = VENUE_PHONE.replace(/\D/g, '');
