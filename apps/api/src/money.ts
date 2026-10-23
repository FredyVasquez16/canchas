const SYMBOLS: Record<string, string> = {
  HNL: 'L',
};

/** Formats integer minor units as money, for example 100000 -> "L 1,000.00". */
export function formatMoney(cents: number, currency = 'HNL'): string {
  const symbol = SYMBOLS[currency] ?? currency;
  const amount = Math.abs(cents);
  const whole = Math.floor(amount / 100).toString();
  const fraction = (amount % 100).toString().padStart(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : ''}${symbol} ${grouped}.${fraction}`;
}
