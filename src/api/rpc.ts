import { callRpc } from './supabase';

/**
 * The write half of this app's data-access surface.
 *
 * Reads live in ./reads.ts. The split is by direction, not by feature: a write
 * takes a caller-minted uuid and is idempotent, a read takes filters and is
 * paginated, and keeping them apart makes each file one thing. Together they
 * are the whole surface -- there is no third way to reach the database.
 *
 * Every function here maps to one SECURITY DEFINER Postgres function in the
 * exposed `public` schema. There is no other way to read or write server data:
 * the tables are in the private `app` schema and the client roles hold no
 * privileges on them. See /docs/supabase-access.md.
 *
 * Note what is absent from every signature: business_id. The server derives the
 * tenant from the JWT. A client cannot name a tenant, so it cannot pick the
 * wrong one.
 */

// --- Onboarding & settings --------------------------------------------------

export interface BootstrapResult {
  business_id: string;
  created: boolean;
}

export function bootstrapBusiness(businessName: string, ownerName = ''): Promise<BootstrapResult> {
  return callRpc<BootstrapResult>('bootstrap_business', {
    p_business_name: businessName,
    p_owner_name: ownerName,
  });
}

/**
 * Joins the business an operator invited you to.
 *
 * This is the onboarding path: an operator creates the business in the admin
 * portal and sends the code. It is deliberately the only way into a tenant from
 * the app -- bootstrapBusiness below creates a NEW tenant and is not part of
 * this flow.
 *
 * Enforces the seat cap server-side, so a business at its limit refuses the
 * claim rather than quietly going over.
 */
export function claimInvite(
  token: string,
  fullName: string,
): Promise<{ business_id: string; role: string; already_member: boolean }> {
  return callRpc('claim_invite', { p_token: token.trim(), p_full_name: fullName.trim() });
}

export interface BusinessSettings {
  name?: string;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  /**
   * Free for every plan, always. A receipt is a payment confirmation, not a tax
   * invoice, so this must never sit behind the paywall.
   */
  showGstinOnReceipt?: boolean;
}

export function updateBusinessSettings(s: BusinessSettings): Promise<unknown> {
  return callRpc('update_business_settings', {
    p_name: s.name ?? null,
    p_phone: s.phone ?? null,
    p_address: s.address ?? null,
    p_gstin: s.gstin ?? null,
    p_show_gstin_on_receipt: s.showGstinOnReceipt ?? null,
  });
}

// --- Master data ------------------------------------------------------------
//
// Upserts, not create/update pairs: the client mints the id, so "create this"
// and "save my edit" are the same request and either can be retried safely.
// Added in migration 0011 -- before it, these tables could only be written
// through the sync push path, which no longer exists (ADR 0003).

export interface CustomerInput {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export function upsertCustomer(c: CustomerInput): Promise<{ customer_id: string; created: boolean }> {
  return callRpc('upsert_customer', {
    p_id: c.id,
    p_name: c.name,
    p_phone: c.phone ?? null,
    p_address: c.address ?? null,
    p_notes: c.notes ?? null,
  });
}

export type SupplierInput = CustomerInput;

export function upsertSupplier(s: SupplierInput): Promise<{ supplier_id: string; created: boolean }> {
  return callRpc('upsert_supplier', {
    p_id: s.id,
    p_name: s.name,
    p_phone: s.phone ?? null,
    p_address: s.address ?? null,
    p_notes: s.notes ?? null,
  });
}

export interface RawMaterialInput {
  id: string;
  name: string;
  skuCode?: string | null;
  /** Grams throughout. The column exists so a later business can use ml or units. */
  baseUnit?: string;
  reorderLevelBase?: number;
  isActive?: boolean;
}

export function upsertRawMaterial(
  m: RawMaterialInput,
): Promise<{ raw_material_id: string; created: boolean }> {
  return callRpc('upsert_raw_material', {
    p_id: m.id,
    p_name: m.name,
    p_sku_code: m.skuCode ?? null,
    p_base_unit: m.baseUnit ?? 'g',
    p_reorder_level_base: m.reorderLevelBase ?? 0,
    p_is_active: m.isActive ?? true,
  });
}

export interface PackedSkuInput {
  id: string;
  rawMaterialId: string;
  name: string;
  /** Packet size in base units, e.g. 500 for a 500 g packet. */
  packSizeBase: number;
  skuCode?: string | null;
  salePrice?: number;
  isActive?: boolean;
}

export function upsertPackedSku(
  s: PackedSkuInput,
): Promise<{ packed_sku_id: string; created: boolean }> {
  return callRpc('upsert_packed_sku', {
    p_id: s.id,
    p_raw_material_id: s.rawMaterialId,
    p_name: s.name,
    p_pack_size_base: s.packSizeBase,
    p_sku_code: s.skuCode ?? null,
    p_sale_price: s.salePrice ?? 0,
    p_is_active: s.isActive ?? true,
  });
}

export type ArchivableTable = 'customers' | 'suppliers' | 'raw_materials' | 'packed_skus';

/** Soft. The ledgers reference these rows, so history must stay readable. */
export function archiveMaster(
  table: ArchivableTable,
  id: string,
): Promise<{ table: string; id: string; archived: boolean }> {
  return callRpc('archive_master', { p_table: table, p_id: id });
}

// --- Purchases & packing ----------------------------------------------------

export interface PurchaseItemInput {
  raw_material_id: string;
  /** Grams. */
  qty_base: number;
  unit_cost_base?: number;
}

export function createPurchase(args: {
  purchaseId: string;
  supplierId?: string | null;
  items: PurchaseItemInput[];
  invoiceNo?: string | null;
  purchasedOn?: string | null;
  notes?: string | null;
  /** Pass false to record stock that has not physically arrived yet. */
  receive?: boolean;
}): Promise<{ purchase_id: string; created: boolean; total_amount?: number; received?: boolean }> {
  return callRpc('create_purchase', {
    p_purchase_id: args.purchaseId,
    p_supplier_id: args.supplierId ?? null,
    p_items: args.items,
    p_invoice_no: args.invoiceNo ?? null,
    p_purchased_on: args.purchasedOn ?? null,
    p_notes: args.notes ?? null,
    p_receive: args.receive ?? true,
  });
}

/**
 * Wastage is NOT a parameter -- the server derives it as
 * `rawConsumedBase - packetsProduced * packSizeBase` and refuses the run if
 * that is negative. Two numbers that cannot disagree beat two that must be
 * cross-checked. See migration 0012.
 */
export function createPackingRun(args: {
  runId: string;
  rawMaterialId: string;
  packedSkuId: string;
  packetsProduced: number;
  /** Everything that left the sack, including what was spilled. */
  rawConsumedBase: number;
  runOn?: string | null;
  notes?: string | null;
  complete?: boolean;
}): Promise<{
  packing_run_id: string;
  created: boolean;
  completed?: boolean;
  packed_base?: number;
  wastage_base?: number;
}> {
  return callRpc('create_packing_run', {
    p_run_id: args.runId,
    p_raw_material_id: args.rawMaterialId,
    p_packed_sku_id: args.packedSkuId,
    p_packets_produced: args.packetsProduced,
    p_raw_consumed_base: args.rawConsumedBase,
    p_run_on: args.runOn ?? null,
    p_notes: args.notes ?? null,
    p_complete: args.complete ?? true,
  });
}

// --- Inventory & packing ----------------------------------------------------

export function receivePurchase(purchaseId: string): Promise<unknown> {
  return callRpc('receive_purchase', { p_purchase_id: purchaseId });
}

export function runConversion(packingRunId: string): Promise<unknown> {
  return callRpc('run_conversion', { p_run_id: packingRunId });
}

// --- Orders -----------------------------------------------------------------

export interface OrderItemInput {
  packed_sku_id: string;
  qty_packets: number;
  /** Omit to use the SKU's current sale price. */
  unit_price?: number;
}

export function createOrder(
  orderId: string,
  customerId: string,
  items: OrderItemInput[],
  notes?: string,
): Promise<{ order_id: string; order_no: number; total_amount: number; created: boolean }> {
  return callRpc('create_order', {
    p_order_id: orderId,
    p_customer_id: customerId,
    p_items: items,
    p_notes: notes ?? null,
  });
}

/** DISPATCH. This is the moment stock leaves -- not order confirmation. */
export function dispatchOrder(orderId: string): Promise<{ already_dispatched: boolean }> {
  return callRpc('dispatch_order', { p_order_id: orderId });
}

export type SettableOrderStatus = 'PACKED' | 'DELIVERED' | 'PAYMENT_PENDING' | 'CANCELLED';

/**
 * `status` is where the order actually ended up, which can differ from the one
 * asked for: delivering a prepaid order closes it on the spot (migration 0021).
 */
export function setOrderStatus(
  orderId: string,
  status: SettableOrderStatus,
): Promise<{ order_id: string; status: string; settled_orders: number[] }> {
  return callRpc('set_order_status', { p_order_id: orderId, p_status: status });
}

// --- Cash -------------------------------------------------------------------

export function recordPayment(args: {
  paymentId: string;
  customerId: string;
  amount: number;
  orderId?: string | null;
  paidOn?: string | null;
  note?: string | null;
}): Promise<{
  created: boolean;
  customer_outstanding: number;
  /**
   * Order numbers this payment closed. A khata payment settles the customer's
   * oldest orders first, so it can close several; absent on a retried call.
   */
  settled_orders?: number[];
}> {
  return callRpc('record_payment', {
    p_payment_id: args.paymentId,
    p_customer_id: args.customerId,
    p_amount: args.amount,
    p_order_id: args.orderId ?? null,
    p_paid_on: args.paidOn ?? null,
    p_note: args.note ?? null,
  });
}

// --- Stock adjustments ------------------------------------------------------

export type AdjustmentEntryType = 'OPENING' | 'ADJUSTMENT' | 'RETURN_IN';

/**
 * Opening balances, stock-take corrections and customer returns.
 *
 * The only way to get existing stock into the app, and the only way to correct
 * it. `entry_type` deliberately cannot be PURCHASE_IN / PACK_* / SALE_OUT --
 * those belong to the operations that cause them, and a movement with no
 * purchase, run or order behind it would be unauditable.
 *
 * `mode` is the part worth understanding:
 *
 *   SET    the user counted the shelf and typed what they counted. The server
 *          reads the current sum and works out the signed delta. This is what
 *          a stock-take actually is, and it keeps arithmetic away from a person
 *          who is holding a clipboard.
 *   DELTA  the user knows the movement -- "3 packets were damaged". Here the
 *          signed number is the thing they know, so ask for it.
 *
 * Either way exactly one signed ledger row is written. A count that matches the
 * books returns `created: false, delta: 0` and is not an error.
 */
export function recordStockAdjustment(args: {
  entryId: string;
  itemKind: 'RAW' | 'PACKED';
  itemId: string;
  mode: 'SET' | 'DELTA';
  /** Grams for RAW, whole packets for PACKED. */
  qty: number;
  entryType?: AdjustmentEntryType;
  note?: string | null;
  /** Required for RETURN_IN: the order the goods came back from. */
  refId?: string | null;
}): Promise<{
  entry_id: string;
  created: boolean;
  delta: number;
  qty_before?: number;
  qty_after?: number;
  entry_type: AdjustmentEntryType;
}> {
  return callRpc('record_stock_adjustment', {
    p_entry_id: args.entryId,
    p_item_kind: args.itemKind,
    p_item_id: args.itemId,
    p_mode: args.mode,
    p_qty: args.qty,
    p_entry_type: args.entryType ?? 'ADJUSTMENT',
    p_note: args.note ?? null,
    p_ref_id: args.refId ?? null,
  });
}

// --- Staff ------------------------------------------------------------------
//
// OWNER only, and seat-capped. These are the tenant-scoped equivalents of the
// admin_* functions: before them, hiring a packer meant asking a platform
// operator to issue the invite.

export type MemberRoleInput = 'OWNER' | 'MANAGER' | 'PACKER' | 'DELIVERY';

/**
 * Takes the invite id from the caller, so a timed-out request can be retried
 * without minting a second token that holds a second seat. (admin_create_invite
 * mints server-side and does not have this property -- the divergence is
 * deliberate; see migration 0019.)
 */
export function inviteMember(args: {
  inviteId: string;
  role: MemberRoleInput;
  phone?: string | null;
  email?: string | null;
}): Promise<{ invite_id: string; invite_token: string; role: string; created: boolean }> {
  return callRpc('invite_member', {
    p_invite_id: args.inviteId,
    p_role: args.role,
    p_phone: args.phone ?? null,
    p_email: args.email ?? null,
  });
}

/** Frees the seat a live invite was holding. */
export function revokeMemberInvite(
  inviteId: string,
): Promise<{ invite_id: string; revoked: boolean }> {
  return callRpc('revoke_member_invite', { p_invite_id: inviteId });
}

/** Refuses to demote the last active owner (hint: `last_owner`). */
export function setMemberRole(
  userId: string,
  role: MemberRoleInput,
): Promise<{ user_id: string; role: string }> {
  return callRpc('set_member_role', { p_user_id: userId, p_role: role });
}

/**
 * Refuses to deactivate the last active owner or yourself; reactivating takes a
 * seat and so respects the cap.
 */
export function setMemberActive(
  userId: string,
  isActive: boolean,
): Promise<{ user_id: string; is_active: boolean }> {
  return callRpc('set_member_active', { p_user_id: userId, p_is_active: isActive });
}

/**
 * Your own name and number. Deliberately cannot set `role` -- that would make
 * every member their own administrator.
 */
export function updateMyProfile(args: {
  fullName?: string | null;
  phone?: string | null;
}): Promise<{ user_id: string; full_name: string; phone: string | null; role: string }> {
  return callRpc('update_my_profile', {
    p_full_name: args.fullName ?? null,
    p_phone: args.phone ?? null,
  });
}
