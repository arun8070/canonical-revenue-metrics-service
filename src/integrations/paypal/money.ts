/**
 * Convert a PayPal decimal amount string (e.g. "25.00") into integer minor
 * units, without ever using floating point (CLAUDE.md §9).
 *
 * PayPal formats `value` with the number of decimals appropriate to the
 * currency. We convert via string + BigInt math against a known per-currency
 * exponent, and reject inputs with more fractional digits than the currency
 * allows rather than silently rounding.
 */
const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  CHF: 2,
  JPY: 0,
  KRW: 0,
};

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency] ?? 2;
}

export function decimalToMinor(value: string, currency: string): number {
  const exponent = currencyExponent(currency);
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const clean = negative ? trimmed.slice(1) : trimmed;

  const parts = clean.split('.');
  const intPart = parts[0] ?? '';
  const fracPart = parts[1] ?? '';
  if (parts.length > 2 || !/^\d+$/.test(intPart) || (fracPart !== '' && !/^\d+$/.test(fracPart))) {
    throw new Error(`Invalid decimal amount: "${value}"`);
  }
  if (fracPart.length > exponent) {
    throw new Error(
      `Amount "${value}" has more decimal places than ${currency} permits (${exponent})`,
    );
  }

  const frac = (fracPart + '0'.repeat(exponent)).slice(0, exponent);
  const minor =
    BigInt(intPart) * 10n ** BigInt(exponent) + BigInt(frac || '0');
  const result = Number(minor);
  return negative ? -result : result;
}
