/**
 * Money formatting.
 *
 * Indian digit grouping is not the western one: 1,23,456 rather than 123,456.
 * The last three digits group, then every two after that. An app that renders
 * `₹123,456` to a shop owner in Telangana reads as foreign software, and the
 * numbers are the whole point of this app.
 *
 * Intl is available in Hermes on RN 0.81, but it has been absent or partial on
 * some Android builds, so there is an explicit fallback rather than a crash or
 * a silently wrong grouping. Both paths are tested.
 *
 * Amounts arrive from Postgres `numeric` as JSON numbers. Payments are signed:
 * a negative amount is a refund or a reversal, so nothing here assumes positive.
 */

/** Groups the integer part Indian-style: last 3, then 2s. */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  // Insert a separator every two digits, reading right to left.
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${grouped},${last3}`;
}

function fallback(value: number, decimals: number): string {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const body = frac ? `${groupIndian(whole)}.${frac}` : groupIndian(whole);
  return `${negative ? '-' : ''}${body}`;
}

/**
 * Formats a rupee amount.
 *
 * Whole rupees by default: paise are not how these businesses quote prices, and
 * a trailing `.00` on every figure is noise on a small screen. Pass
 * `decimals: 2` where paise genuinely matter.
 */
export function formatMoney(
  value: number | string | null | undefined,
  options: { decimals?: number; withSymbol?: boolean } = {},
): string {
  const { decimals = 0, withSymbol = true } = options;
  const n = typeof value === 'string' ? Number(value) : value;

  if (n === null || n === undefined || Number.isNaN(n)) {
    return withSymbol ? '₹-' : '-';
  }

  let body: string;
  try {
    body = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
    // Guard against an Intl that exists but ignores the locale: if a
    // six-figure number came back western-grouped, use our own grouping.
    if (Math.abs(n) >= 100000 && !/^-?\d{1,2},/.test(body)) {
      body = fallback(n, decimals);
    }
  } catch {
    body = fallback(n, decimals);
  }

  return withSymbol ? `₹${body}` : body;
}

/**
 * Cost per base unit (per gram, usually) from what was actually paid.
 *
 * People know the bill total -- "₹900 for the bag" -- not a per-gram price, so
 * the screen asks for the total and the purchase line is stored per base unit,
 * which is what create_purchase expects. Null when either side is missing,
 * zero or not a number: no cost is better than a cost of Infinity.
 */
export function unitCostPerBase(
  totalPaid: number | null | undefined,
  qtyBase: number | null | undefined,
): number | null {
  if (totalPaid == null || qtyBase == null) return null;
  if (!Number.isFinite(totalPaid) || !Number.isFinite(qtyBase)) return null;
  if (totalPaid <= 0 || qtyBase <= 0) return null;
  return totalPaid / qtyBase;
}
