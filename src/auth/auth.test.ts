import { describe, expect, it } from 'vitest';

import { allowed, can, isWrite } from './roles';
import { resolveLanding } from './landing';

/**
 * The other half of what src/sync/policy.test.ts used to cover. Routing decides
 * what the whole app shows, and the capability matrix decides which buttons
 * exist -- both are pure, and both are silent when wrong.
 */

describe('can', () => {
  it('lets the whole team read orders and stock', () => {
    // A packer who cannot see the queue cannot pack.
    for (const role of ['OWNER', 'MANAGER', 'PACKER', 'DELIVERY'] as const) {
      expect(can(role, 'view_orders')).toBe(true);
      expect(can(role, 'view_stock')).toBe(true);
    }
  });

  it('keeps supplier costs away from a packer', () => {
    // purchase_items.unit_cost_base is margin. Mirrors list_purchases in 0017.
    expect(can('PACKER', 'view_suppliers')).toBe(false);
    expect(can('PACKER', 'manage_purchases')).toBe(false);
    expect(can('MANAGER', 'manage_purchases')).toBe(true);
  });

  it('keeps the khata away from a packer but gives it to delivery', () => {
    // A delivery person collects cash and needs to know what to ask for.
    expect(can('PACKER', 'view_khata')).toBe(false);
    expect(can('DELIVERY', 'view_khata')).toBe(true);
    expect(can('DELIVERY', 'record_payment')).toBe(true);
  });

  it('lets only owners and managers take an order', () => {
    expect(can('OWNER', 'create_order')).toBe(true);
    expect(can('MANAGER', 'create_order')).toBe(true);
    expect(can('PACKER', 'create_order')).toBe(false);
    expect(can('DELIVERY', 'create_order')).toBe(false);
  });

  it('lets a packer mark packed but never dispatch', () => {
    // Dispatch is where stock leaves; it is not a packer's call.
    expect(can('PACKER', 'mark_packed')).toBe(true);
    expect(can('PACKER', 'dispatch_order')).toBe(false);
    expect(can('DELIVERY', 'dispatch_order')).toBe(true);
  });

  it('stops anyone but an owner inventing stock', () => {
    expect(can('OWNER', 'adjust_stock')).toBe(true);
    expect(can('MANAGER', 'adjust_stock')).toBe(true);
    expect(can('PACKER', 'adjust_stock')).toBe(false);
  });

  it('reserves staff and settings for the owner', () => {
    expect(can('OWNER', 'manage_staff')).toBe(true);
    expect(can('MANAGER', 'manage_staff')).toBe(false);
    expect(can('MANAGER', 'manage_settings')).toBe(false);
  });

  it('grants a null role nothing', () => {
    expect(can(null, 'view_orders')).toBe(false);
    expect(can(undefined, 'view_stock')).toBe(false);
  });
});

describe('isWrite / allowed', () => {
  it('classifies reads and writes', () => {
    expect(isWrite('view_orders')).toBe(false);
    expect(isWrite('view_khata')).toBe(false);
    expect(isWrite('dispatch_order')).toBe(true);
    expect(isWrite('record_payment')).toBe(true);
  });

  it('blocks writes while read-only but never blocks reads', () => {
    // The product promise: a lapse is read-only and never a data lock.
    expect(allowed('OWNER', 'create_order', true)).toBe(false);
    expect(allowed('OWNER', 'record_payment', true)).toBe(false);
    expect(allowed('OWNER', 'view_orders', true)).toBe(true);
    expect(allowed('DELIVERY', 'view_khata', true)).toBe(true);
  });

  it('still respects the role while read-only', () => {
    expect(allowed('PACKER', 'view_orders', true)).toBe(true);
    expect(allowed('PACKER', 'create_order', false)).toBe(false);
  });
});

describe('resolveLanding', () => {
  it('sends a signed-out user to sign in', () => {
    expect(resolveLanding({ hasSession: false })).toBe('/(auth)/sign-in');
  });

  it('sends a member with no business to claim an invite', () => {
    expect(resolveLanding({ hasSession: true, membershipState: 'NONE' })).toBe(
      '/(auth)/claim-invite',
    );
  });

  it('distinguishes a deactivated member from one who never joined', () => {
    // Only possible because of the profiles_self_select policy in 0017.
    expect(resolveLanding({ hasSession: true, membershipState: 'INACTIVE' })).toBe(
      '/(auth)/blocked',
    );
  });

  it('routes each role to its own shell', () => {
    const base = { hasSession: true, membershipState: 'ACTIVE' } as const;
    expect(resolveLanding({ ...base, role: 'OWNER' })).toBe('/(owner)');
    expect(resolveLanding({ ...base, role: 'MANAGER' })).toBe('/(owner)');
    expect(resolveLanding({ ...base, role: 'PACKER' })).toBe('/(pack)');
    expect(resolveLanding({ ...base, role: 'DELIVERY' })).toBe('/(deliver)');
  });

  it('demands an update before anything else, even for a valid owner', () => {
    // Rendering a stale payload shape on a cash screen is the failure mode.
    expect(
      resolveLanding(
        { hasSession: true, membershipState: 'ACTIVE', role: 'OWNER', serverMinClient: 9 },
        1,
      ),
    ).toBe('/(auth)/update-required');
  });

  it('does not demand an update when the build is current or ahead', () => {
    const base = { hasSession: true, membershipState: 'ACTIVE', role: 'OWNER' } as const;
    expect(resolveLanding({ ...base, serverMinClient: 1 }, 1)).toBe('/(owner)');
    expect(resolveLanding({ ...base, serverMinClient: 1 }, 2)).toBe('/(owner)');
  });

  it('tolerates a server with no contract at all', () => {
    expect(
      resolveLanding({ hasSession: true, membershipState: 'ACTIVE', role: 'OWNER' }, 1),
    ).toBe('/(owner)');
  });

  it('does not guess into the app before the context loads', () => {
    expect(resolveLanding({ hasSession: true })).toBe('/(auth)/sign-in');
  });

  it('does not route an active member with an unknown role into the app', () => {
    expect(
      resolveLanding({ hasSession: true, membershipState: 'ACTIVE', role: null }),
    ).toBe('/(auth)/sign-in');
  });
});
