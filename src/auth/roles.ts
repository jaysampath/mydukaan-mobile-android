import type { MemberRole } from '../api/reads';

/**
 * What each role may do, in the client.
 *
 * **This is UX, not security.** Every one of these actions is re-checked by
 * `app.require_role()` inside the RPC, and the server is the only authority. The
 * point of having it here is that a packer should not be shown a button that
 * will refuse them -- being told "no" after tapping is a worse experience than
 * never seeing the option.
 *
 * Kept in step with the role matrix in migrations 0007, 0011, 0017 and 0019. If
 * these ever disagree, the server wins and this file is the bug.
 *
 * Pure, no imports beyond a type: unit-testable in Node.
 */

export type Capability =
  // masters
  | 'manage_masters'
  | 'view_suppliers'
  // inventory
  | 'view_stock'
  | 'adjust_stock'
  | 'manage_purchases'
  | 'view_stock_ledger'
  // packing
  | 'run_packing'
  // orders
  | 'view_orders'
  | 'create_order'
  | 'mark_packed'
  | 'dispatch_order'
  | 'mark_delivered'
  // cash
  | 'record_payment'
  | 'view_khata'
  // admin
  | 'manage_staff'
  | 'manage_settings';

const MATRIX: Record<Capability, readonly MemberRole[]> = {
  manage_masters: ['OWNER', 'MANAGER'],
  // Suppliers sit next to purchase costs, which are margin.
  view_suppliers: ['OWNER', 'MANAGER'],

  view_stock: ['OWNER', 'MANAGER', 'PACKER', 'DELIVERY'],
  adjust_stock: ['OWNER', 'MANAGER'],
  manage_purchases: ['OWNER', 'MANAGER'],
  view_stock_ledger: ['OWNER', 'MANAGER'],

  run_packing: ['OWNER', 'MANAGER', 'PACKER'],

  // A packer who cannot see the queue cannot pack; a delivery person who
  // cannot see their run cannot deliver. Reading orders is open to the team.
  view_orders: ['OWNER', 'MANAGER', 'PACKER', 'DELIVERY'],
  create_order: ['OWNER', 'MANAGER'],
  mark_packed: ['OWNER', 'MANAGER', 'PACKER'],
  dispatch_order: ['OWNER', 'MANAGER', 'DELIVERY'],
  mark_delivered: ['OWNER', 'MANAGER', 'DELIVERY'],

  record_payment: ['OWNER', 'MANAGER', 'DELIVERY'],
  view_khata: ['OWNER', 'MANAGER', 'DELIVERY'],

  manage_staff: ['OWNER'],
  manage_settings: ['OWNER'],
};

/** Whether this role may do this thing. A null role may do nothing. */
export function can(role: MemberRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return MATRIX[capability].includes(role);
}

/**
 * Which capabilities are writes.
 *
 * A lapsed subscription is read-only, so these are hidden or disabled while
 * `is_read_only` is true -- and reads never are, which is the product promise:
 * you always keep your own books.
 */
const WRITES: ReadonlySet<Capability> = new Set<Capability>([
  'manage_masters',
  'adjust_stock',
  'manage_purchases',
  'run_packing',
  'create_order',
  'mark_packed',
  'dispatch_order',
  'mark_delivered',
  'record_payment',
  'manage_staff',
  'manage_settings',
]);

export function isWrite(capability: Capability): boolean {
  return WRITES.has(capability);
}

/**
 * The single question a screen asks before rendering an action: may this
 * person, on this plan, do this now?
 */
export function allowed(
  role: MemberRole | null | undefined,
  capability: Capability,
  isReadOnly = false,
): boolean {
  if (!can(role, capability)) return false;
  if (isReadOnly && isWrite(capability)) return false;
  return true;
}
