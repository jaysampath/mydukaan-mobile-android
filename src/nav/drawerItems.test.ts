import { describe, expect, it } from 'vitest';

import type { MemberRole } from '../api/reads';
import { drawerSections, type DrawerViewer } from './drawerItems';

const keysFor = (role: MemberRole | null, hasPacking = true) =>
  drawerSections({ role, hasPacking } satisfies DrawerViewer).flatMap((s) =>
    s.items.map((i) => i.key),
  );

describe('drawer items', () => {
  it('gives an owner everything', () => {
    expect(keysFor('OWNER')).toEqual([
      'customers',
      'materials',
      'skus',
      'packing',
      'staff',
      'settings',
    ]);
  });

  it('gives a manager the catalog and packing, but not staff or settings', () => {
    const k = keysFor('MANAGER');
    expect(k).toContain('customers');
    expect(k).toContain('packing');
    expect(k).not.toContain('staff');
    expect(k).not.toContain('settings');
  });

  it('gives a packer no catalog and no business section', () => {
    // Packing is a tab in their own app, so it is not repeated here either.
    expect(keysFor('PACKER')).toEqual([]);
  });

  it('gives delivery staff no catalog, business or packing', () => {
    expect(keysFor('DELIVERY')).toEqual([]);
  });

  it('gives nothing to someone with no role', () => {
    expect(keysFor(null)).toEqual([]);
  });

  it('hides packing when the business has the module switched off', () => {
    expect(keysFor('OWNER', false)).not.toContain('packing');
  });

  it('groups consecutive items under one section heading', () => {
    const sections = drawerSections({ role: 'OWNER', hasPacking: true }).map((s) => s.section);
    expect(sections).toEqual(['catalog', 'operations', 'business']);
  });
});
