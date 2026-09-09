import { describe, expect, it } from 'vitest';

import { contractPermitsSync, nonEmptyTables } from './policy';

/**
 * The two decisions in the sync cycle that are pure enough to test in Node.
 *
 * Everything else in sync.ts needs the native SQLite adapter or NetInfo, so it
 * is covered by the on-device acceptance test in docs/build-and-release.md
 * instead.
 */

describe('contractPermitsSync', () => {
  it('allows a server that requires exactly this build', () => {
    expect(contractPermitsSync(3, 3)).toBe(true);
  });

  it('allows a server whose additive changes left min_client behind', () => {
    expect(contractPermitsSync(2, 5)).toBe(true);
  });

  it('blocks a build older than the server requires', () => {
    expect(contractPermitsSync(4, 3)).toBe(false);
  });

  it('treats a server with no contract as compatible', () => {
    // Anything before migration 0009 sends no contract. Refusing to sync
    // against it would strand every device the moment we deployed the check.
    expect(contractPermitsSync(undefined, 1)).toBe(true);
  });
});

describe('nonEmptyTables', () => {
  const empty = { created: [], updated: [], deleted: [] };

  it('ignores tables with nothing in them', () => {
    expect(nonEmptyTables({ orders: empty, payments: empty })).toEqual([]);
  });

  it.each([
    ['created', { ...empty, created: [{ id: 'a' }] }],
    ['updated', { ...empty, updated: [{ id: 'a' }] }],
    ['deleted', { ...empty, deleted: ['a'] }],
  ])('reports a table with only %s rows', (_kind, set) => {
    expect(nonEmptyTables({ orders: empty, payments: set })).toEqual(['payments']);
  });

  it('reports every dirty table, so the error names all of them', () => {
    const dirty = { ...empty, created: [{ id: 'a' }] };
    expect(nonEmptyTables({ orders: dirty, payments: dirty, customers: empty }).sort()).toEqual([
      'orders',
      'payments',
    ]);
  });
});
