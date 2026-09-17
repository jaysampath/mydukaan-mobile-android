import { describe, expect, it } from 'vitest';

import { formatMoney, groupIndian } from './money';
import { formatPackSize, formatPackedQty, formatQty, formatRawQty } from './qty';
import { formatDate, formatTime, formatWhen, parseWhen, todayIso } from './date';

/**
 * These replace part of what src/sync/policy.test.ts used to cover: pure
 * decisions whose wrong answer is silent. Money rendered with western grouping
 * or a bulk quantity rendered as packets are both bugs a user notices before we
 * do, and neither would fail a typecheck.
 */

describe('groupIndian', () => {
  it('leaves three digits or fewer alone', () => {
    expect(groupIndian('9')).toBe('9');
    expect(groupIndian('999')).toBe('999');
  });

  it('groups the last three, then twos', () => {
    expect(groupIndian('1000')).toBe('1,000');
    expect(groupIndian('123456')).toBe('1,23,456');
    expect(groupIndian('10000000')).toBe('1,00,00,000');
  });
});

describe('formatMoney', () => {
  it('formats whole rupees with the symbol', () => {
    expect(formatMoney(240)).toBe('₹240');
  });

  it('uses Indian grouping at the lakh boundary', () => {
    // The bug this guards: ₹123,456 instead of ₹1,23,456.
    expect(formatMoney(123456)).toBe('₹1,23,456');
  });

  it('groups at the crore boundary', () => {
    expect(formatMoney(10000000)).toBe('₹1,00,00,000');
  });

  it('handles a negative amount, because a payment can be a reversal', () => {
    expect(formatMoney(-500)).toBe('₹-500');
  });

  it('formats zero rather than falling through to a dash', () => {
    expect(formatMoney(0)).toBe('₹0');
  });

  it('shows paise only when asked', () => {
    expect(formatMoney(240.5, { decimals: 2 })).toBe('₹240.50');
    expect(formatMoney(240.5)).toBe('₹241');
  });

  it('accepts the string numerics Postgres sends', () => {
    expect(formatMoney('1234')).toBe('₹1,234');
  });

  it('degrades to a dash on a missing or unparseable value', () => {
    expect(formatMoney(null)).toBe('₹-');
    expect(formatMoney(undefined)).toBe('₹-');
    expect(formatMoney('abc')).toBe('₹-');
  });

  it('can omit the symbol for use next to one', () => {
    expect(formatMoney(240, { withSymbol: false })).toBe('240');
  });
});

describe('formatRawQty', () => {
  it('keeps sub-kilo amounts in grams', () => {
    expect(formatRawQty(999)).toBe('999 g');
  });

  it('promotes to kg at exactly 1000 g', () => {
    expect(formatRawQty(1000)).toBe('1 kg');
  });

  it('keeps a fractional kilo readable', () => {
    expect(formatRawQty(1500)).toBe('1.5 kg');
  });

  it('formats the seeded turmeric balance', () => {
    expect(formatRawQty(40000)).toBe('40 kg');
  });

  it('promotes ml to litres, not kg', () => {
    expect(formatRawQty(2000, 'ml')).toBe('2 L');
  });

  it('never promotes pieces', () => {
    expect(formatRawQty(5000, 'pcs')).toBe('5000 pcs');
  });

  it('handles zero and negatives (a correction is a negative row)', () => {
    expect(formatRawQty(0)).toBe('0 g');
    expect(formatRawQty(-2000)).toBe('-2 kg');
  });
});

describe('formatPackedQty', () => {
  it('counts packets, never converting to weight', () => {
    // The bug this guards: 20 packets rendered as "20 g".
    expect(formatPackedQty(20)).toBe('20 packets');
  });

  it('is singular for one', () => {
    expect(formatPackedQty(1)).toBe('1 packet');
  });

  it('handles zero', () => {
    expect(formatPackedQty(0)).toBe('0 packets');
  });
});

describe('formatQty dispatch', () => {
  it('reads the same number two different ways by kind', () => {
    expect(formatQty(20, 'RAW')).toBe('20 g');
    expect(formatQty(20, 'PACKED')).toBe('20 packets');
  });
});

describe('formatPackSize', () => {
  it('labels a SKU the same way stock is labelled', () => {
    expect(formatPackSize(500)).toBe('500 g');
    expect(formatPackSize(1000)).toBe('1 kg');
  });
});

describe('parseWhen', () => {
  it('parses the ISO strings the read layer now sends', () => {
    const d = parseWhen('2026-09-17T05:38:22.484081+00:00');
    expect(d).not.toBeNull();
    expect(d?.getUTCFullYear()).toBe(2026);
  });

  it('still parses epoch-ms, so an old payload does not render 1970', () => {
    expect(parseWhen(1758000000000)?.getUTCFullYear()).toBe(2025);
  });

  it('returns null rather than an Invalid Date', () => {
    expect(parseWhen(null)).toBeNull();
    expect(parseWhen('')).toBeNull();
    expect(parseWhen('not a date')).toBeNull();
  });
});

describe('formatWhen', () => {
  const now = new Date(2026, 8, 17, 15, 5); // 17 Sep 2026, 3:05pm local

  it('shows the time for something that happened today', () => {
    const earlier = new Date(2026, 8, 17, 9, 30).toISOString();
    expect(formatWhen(earlier, now)).toBe('9:30 am');
  });

  it('says Yesterday rather than a date', () => {
    const y = new Date(2026, 8, 16, 11, 0).toISOString();
    expect(formatWhen(y, now)).toBe('Yesterday');
  });

  it('shows a date for anything older', () => {
    const older = new Date(2026, 8, 10, 11, 0).toISOString();
    expect(formatWhen(older, now)).toBe('10 Sep');
  });

  it('includes the year once it differs', () => {
    const older = new Date(2025, 8, 10, 11, 0).toISOString();
    expect(formatWhen(older, now)).toBe('10 Sep 2025');
  });
});

describe('formatTime', () => {
  it('renders noon and midnight as 12, not 0', () => {
    expect(formatTime(new Date(2026, 8, 17, 12, 0).toISOString())).toBe('12:00 pm');
    expect(formatTime(new Date(2026, 8, 17, 0, 5).toISOString())).toBe('12:05 am');
  });
});

describe('formatDate', () => {
  it('omits the current year', () => {
    const now = new Date(2026, 8, 17);
    expect(formatDate(new Date(2026, 0, 3).toISOString(), now)).toBe('3 Jan');
  });
});

describe('todayIso', () => {
  it('zero-pads, because Postgres wants a real ISO date', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
