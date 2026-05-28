/**
 * Supported ISO 4217 currencies for the workspace currency setting.
 * Must stay in sync with SUPPORTED_CURRENCIES in the API's workspaces.service.ts.
 *
 * The currency drives money displays across the app AND is passed to the
 * Niche Intelligence AI so RPM is estimated natively in that currency.
 */
export interface CurrencyOption {
  code: string;   // ISO 4217, e.g. "USD"
  name: string;   // human label, e.g. "US Dollar"
  symbol: string;  // compact symbol, e.g. "$"
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'USD', name: 'US Dollar',            symbol: '$' },
  { code: 'EUR', name: 'Euro',                 symbol: '€' },
  { code: 'GBP', name: 'British Pound',        symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen',         symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan',         symbol: '¥' },
  { code: 'AUD', name: 'Australian Dollar',    symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar',      symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc',          symbol: 'CHF' },
  { code: 'HKD', name: 'Hong Kong Dollar',     symbol: 'HK$' },
  { code: 'SGD', name: 'Singapore Dollar',     symbol: 'S$' },
  { code: 'MYR', name: 'Malaysian Ringgit',    symbol: 'RM' },
  { code: 'INR', name: 'Indian Rupee',         symbol: '₹' },
  { code: 'IDR', name: 'Indonesian Rupiah',    symbol: 'Rp' },
  { code: 'THB', name: 'Thai Baht',            symbol: '฿' },
  { code: 'PHP', name: 'Philippine Peso',      symbol: '₱' },
  { code: 'VND', name: 'Vietnamese Dong',      symbol: '₫' },
  { code: 'KRW', name: 'South Korean Won',     symbol: '₩' },
  { code: 'TWD', name: 'New Taiwan Dollar',    symbol: 'NT$' },
  { code: 'NZD', name: 'New Zealand Dollar',   symbol: 'NZ$' },
  { code: 'SEK', name: 'Swedish Krona',        symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone',      symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone',         symbol: 'kr' },
  { code: 'AED', name: 'UAE Dirham',           symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal',          symbol: '﷼' },
  { code: 'BRL', name: 'Brazilian Real',       symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso',         symbol: 'Mex$' },
  { code: 'ZAR', name: 'South African Rand',   symbol: 'R' },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));
const DEFAULT_CURRENCY = CURRENCIES[0]!; // USD — the list is a non-empty literal

export function getCurrency(code: string | null | undefined): CurrencyOption {
  return (code ? BY_CODE.get(code) : undefined) ?? DEFAULT_CURRENCY;
}

/**
 * Format an amount in the given currency. Uses Intl for correct symbol +
 * grouping, falling back to a manual symbol prefix if the runtime doesn't
 * know the code. `decimals` defaults to 2 (RPM values can be < 1).
 */
export function formatCurrency(
  amount: number,
  code: string,
  decimals = 2,
): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    const c = getCurrency(code);
    return `${c.symbol}${amount.toFixed(decimals)}`;
  }
}
