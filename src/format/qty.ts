/**
 * Quantity formatting.
 *
 * The server stores two different units in one column name, and getting them
 * confused is the highest-consequence display bug in this data model:
 *
 *   RAW    qty_base is GRAMS (or ml, or pieces -- raw_materials.base_unit says)
 *   PACKED qty_base is WHOLE PACKETS
 *
 * So 20 means "20 packets" for a SKU and "20 grams" for bulk. A screen that
 * divides by 1000 in the wrong place turns 40 kg of turmeric into 40 g, or
 * tells a packer to make 20,000 packets.
 *
 * Hence: no screen ever divides by 1000, and no screen ever appends a unit by
 * hand. Both live here, once.
 */

export type ItemKind = 'RAW' | 'PACKED';
export type BaseUnit = 'g' | 'ml' | 'pcs';

/** Trims a trailing .0 / .00 so 1.5 kg stays 1.5 kg but 2.0 kg reads 2 kg. */
function trim(n: number, decimals: number): string {
  return Number(n.toFixed(decimals)).toString();
}

/**
 * Formats a raw/bulk quantity in its base unit, promoting to kg or litres once
 * the number gets long. 999 g stays grams; 1000 g becomes 1 kg.
 */
export function formatRawQty(
  qtyBase: number | string | null | undefined,
  baseUnit: BaseUnit = 'g',
): string {
  const n = typeof qtyBase === 'string' ? Number(qtyBase) : qtyBase;
  if (n === null || n === undefined || Number.isNaN(n)) return '-';

  if (baseUnit === 'pcs') {
    return `${trim(n, 0)} pcs`;
  }

  const big = baseUnit === 'g' ? 'kg' : 'L';
  if (Math.abs(n) >= 1000) {
    return `${trim(n / 1000, 2)} ${big}`;
  }
  return `${trim(n, 0)} ${baseUnit}`;
}

/**
 * Formats a packed quantity. Always whole packets -- a half packet is not a
 * thing that exists on a shelf.
 */
export function formatPackedQty(qtyPackets: number | string | null | undefined): string {
  const n = typeof qtyPackets === 'string' ? Number(qtyPackets) : qtyPackets;
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  const whole = trim(n, 0);
  return `${whole} ${Math.abs(n) === 1 ? 'packet' : 'packets'}`;
}

/** Dispatches on item_kind, for the screens that handle both. */
export function formatQty(
  qty: number | string | null | undefined,
  kind: ItemKind,
  baseUnit: BaseUnit = 'g',
): string {
  return kind === 'RAW' ? formatRawQty(qty, baseUnit) : formatPackedQty(qty);
}

/**
 * The size of one packet, for a SKU label: 500 -> "500 g", 1000 -> "1 kg".
 * Same promotion rule as a bulk quantity, deliberately, so "1 kg" on the SKU
 * and "1 kg" in the stock list mean the same thing.
 */
export function formatPackSize(
  packSizeBase: number | string | null | undefined,
  baseUnit: BaseUnit = 'g',
): string {
  return formatRawQty(packSizeBase, baseUnit);
}
