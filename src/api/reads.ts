import { callRpc } from './supabase';
import type { ApiContract } from './contract';

/** The server's side of the version handshake. The launch path takes it from
 *  get_my_context instead, so this is for the update-required screen's retry. */
export function apiContract(): Promise<ApiContract> {
  return callRpc<ApiContract>('schema_contract');
}

/**
 * The read half of this app's data-access surface. Writes live in ./rpc.ts.
 *
 * Every function maps to one read RPC from migration 0017. These exist because
 * there is no local database any more: before ADR 0003 the screens read a
 * WatermelonDB replica kept fresh by sync_pull, and only three read RPCs
 * existed. Now these ARE the data path.
 *
 * Two conventions the server guarantees, and the app relies on:
 *
 *   * Timestamps are ISO 8601 strings, not epoch milliseconds. The epoch-ms
 *     convention died with app.to_wire(); it existed for WatermelonDB's @date
 *     fields. Parse with src/format/date.ts, never `new Date(number)`.
 *   * business_id appears in no payload. The tenant comes from the JWT, and a
 *     client that cannot name a tenant cannot name the wrong one. The contract
 *     test walks every response asserting the key is absent.
 *
 * Postgres `numeric` arrives as a JSON number. Do not stringify it here; format
 * at the edge with src/format.
 */

/** Every paginated read returns this envelope. `has_more` drives "Load more". */
export interface Page<T> {
  rows: T[];
  has_more: boolean;
  limit: number;
  offset: number;
}

export interface PageArgs {
  limit?: number;
  offset?: number;
}

/** Server clamps to [1, 200]; sending more is not an error, just ignored. */
function page(args: PageArgs = {}) {
  return { p_limit: args.limit ?? 50, p_offset: args.offset ?? 0 };
}

// --- The launch call --------------------------------------------------------

export type MemberRole = 'OWNER' | 'MANAGER' | 'PACKER' | 'DELIVERY';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'LAPSED';

/**
 * Whether this account is in a business at all.
 *
 * The app routes on this rather than on the text of an error. The Phase 0
 * screen decided the same thing by string-matching 'not an active member' out
 * of a sync failure, which broke the moment the message was reworded.
 */
export type MembershipState = 'ACTIVE' | 'INACTIVE' | 'NONE';

export interface MyContext {
  user_id: string;
  membership_state: MembershipState;
  profile: {
    user_id: string;
    full_name: string;
    phone: string | null;
    role: MemberRole;
    is_active: boolean;
  } | null;
  business: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    gstin: string | null;
    show_gstin_on_receipt: boolean;
    currency: string;
    subscription_status: SubscriptionStatus;
    trial_ends_at: string | null;
    seat_limit: number;
    /** Per-business module toggles. `packing` gates the conversion screens. */
    features: { packing?: boolean } & Record<string, unknown>;
  } | null;
  /**
   * Decided by the server (app.has_write_access()), never re-derived here.
   * A TypeScript copy of the TRIAL/trial_ends_at/ACTIVE rule is exactly the
   * duplication ADR 0003 removed -- do not reintroduce one.
   */
  is_read_only: boolean;
  seats: { limit: number; used: number; available: number } | null;
  contract: ApiContract;
  is_platform_admin: boolean;
  server_time: string;
}

/**
 * Everything the app needs on launch, in one round trip.
 *
 * Answers for a signed-in user with no membership too -- that is the point, and
 * why it carries no membership guard server-side.
 */
export function getMyContext(): Promise<MyContext> {
  return callRpc<MyContext>('get_my_context');
}

// --- Masters ----------------------------------------------------------------

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  /** Running khata across all orders, not per order. */
  outstanding: number;
}

export function listCustomers(
  args: PageArgs & { search?: string | null } = {},
): Promise<Page<CustomerRow>> {
  return callRpc('list_customers', { p_search: args.search ?? null, ...page(args) });
}

export interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

export function listSuppliers(
  args: PageArgs & { search?: string | null } = {},
): Promise<Page<SupplierRow>> {
  return callRpc('list_suppliers', { p_search: args.search ?? null, ...page(args) });
}

export interface RawMaterialRow {
  id: string;
  name: string;
  sku_code: string | null;
  base_unit: 'g' | 'ml' | 'pcs';
  reorder_level_base: number;
  is_active: boolean;
  /** Grams. Derived from the ledger on every call; nothing is cached. */
  qty_base: number;
  below_reorder: boolean;
}

/** Not paginated: a spice wholesaler has tens of these, and pickers need all. */
export function listRawMaterials(includeInactive = false): Promise<RawMaterialRow[]> {
  return callRpc('list_raw_materials', { p_include_inactive: includeInactive });
}

export interface PackedSkuRow {
  id: string;
  raw_material_id: string;
  raw_material_name: string;
  name: string;
  pack_size_base: number;
  sku_code: string | null;
  sale_price: number;
  is_active: boolean;
  /** Whole packets, not grams. See src/format/qty.ts. */
  qty_packets: number;
}

export function listPackedSkus(args: {
  includeInactive?: boolean;
  rawMaterialId?: string | null;
} = {}): Promise<PackedSkuRow[]> {
  return callRpc('list_packed_skus', {
    p_include_inactive: args.includeInactive ?? false,
    p_raw_material_id: args.rawMaterialId ?? null,
  });
}

// --- Orders -----------------------------------------------------------------

export type OrderStatus =
  | 'PLACED'
  | 'PACKED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'PAYMENT_PENDING'
  | 'CLOSED'
  | 'CANCELLED';

export interface OrderRow {
  id: string;
  /** Null only if the order never reached the server. Allocated server-side. */
  order_no: number | null;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  placed_at: string;
  packed_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  paid: number;
  balance: number;
  item_count: number;
}

export function listOrders(
  args: PageArgs & {
    statuses?: OrderStatus[] | null;
    customerId?: string | null;
    from?: string | null;
    to?: string | null;
  } = {},
): Promise<Page<OrderRow>> {
  return callRpc('list_orders', {
    p_statuses: args.statuses ?? null,
    p_customer_id: args.customerId ?? null,
    p_from: args.from ?? null,
    p_to: args.to ?? null,
    ...page(args),
  });
}

/**
 * What the app may do to this order next, decided by the server.
 *
 * The lifecycle rule lives in three places in SQL (set_order_status's
 * allowlist, dispatch_order's guard, record_payment's close condition), so the
 * server resolves it and the client renders it. A screen that re-derived the
 * state machine in TypeScript would be a fourth copy waiting to disagree.
 *
 * Note `cancel` is absent once an order has been dispatched: there is no
 * reversal RPC yet, so cancelling would flip the status while the SALE_OUT
 * ledger rows stand and the stock would never come back.
 */
export type OrderAction =
  | 'mark_packed'
  | 'dispatch'
  | 'mark_delivered'
  | 'mark_payment_pending'
  | 'record_payment'
  | 'cancel';

export interface OrderDetail {
  order: {
    id: string;
    order_no: number | null;
    status: OrderStatus;
    total_amount: number;
    notes: string | null;
    placed_at: string;
    packed_at: string | null;
    dispatched_at: string | null;
    delivered_at: string | null;
    closed_at: string | null;
    cancelled_at: string | null;
  };
  customer: { id: string; name: string; phone: string | null; address: string | null };
  items: Array<{
    id: string;
    packed_sku_id: string;
    name: string;
    pack_size_base: number;
    qty_packets: number;
    unit_price: number;
    line_total: number;
    /** On the shelf right now, so dispatch can show "4 needed, 20 on hand". */
    qty_on_hand: number;
  }>;
  payments: Array<{ id: string; amount: number; paid_on: string; note: string | null }>;
  paid: number;
  balance: number;
  customer_outstanding: number;
  allowed_transitions: OrderAction[];
}

export function getOrder(orderId: string): Promise<OrderDetail> {
  return callRpc('get_order', { p_order_id: orderId });
}

// --- Purchases & packing ----------------------------------------------------
//
// OWNER/MANAGER only. Purchase lines carry unit_cost_base -- what you pay your
// supplier, and therefore your margin. A packer has no need for it.

export interface PurchaseRow {
  id: string;
  purchase_no: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_no: string | null;
  purchased_on: string;
  total_amount: number;
  notes: string | null;
  status: 'DRAFT' | 'RECEIVED' | 'CANCELLED';
  received_at: string | null;
  item_count: number;
}

export function listPurchases(
  args: PageArgs & {
    supplierId?: string | null;
    status?: string | null;
    from?: string | null;
    to?: string | null;
  } = {},
): Promise<Page<PurchaseRow>> {
  return callRpc('list_purchases', {
    p_supplier_id: args.supplierId ?? null,
    p_status: args.status ?? null,
    p_from: args.from ?? null,
    p_to: args.to ?? null,
    ...page(args),
  });
}

export interface PurchaseDetail {
  purchase: {
    id: string;
    purchase_no: number | null;
    invoice_no: string | null;
    purchased_on: string;
    total_amount: number;
    notes: string | null;
    status: string;
    received_at: string | null;
  };
  supplier: { id: string; name: string; phone: string | null } | null;
  items: Array<{
    id: string;
    raw_material_id: string;
    name: string;
    base_unit: string;
    qty_base: number;
    unit_cost_base: number;
    line_total: number;
  }>;
}

export function getPurchase(purchaseId: string): Promise<PurchaseDetail> {
  return callRpc('get_purchase', { p_purchase_id: purchaseId });
}

export interface PackingRunRow {
  id: string;
  raw_material_id: string;
  raw_material_name: string;
  packed_sku_id: string;
  packed_sku_name: string;
  pack_size_base: number;
  packets_produced: number;
  raw_consumed_base: number;
  /** Derived server-side, never entered. See migration 0012. */
  wastage_base: number;
  run_on: string;
  notes: string | null;
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  completed_at: string | null;
}

export function listPackingRuns(
  args: PageArgs & { status?: string | null; from?: string | null; to?: string | null } = {},
): Promise<Page<PackingRunRow>> {
  return callRpc('list_packing_runs', {
    p_status: args.status ?? null,
    p_from: args.from ?? null,
    p_to: args.to ?? null,
    ...page(args),
  });
}

// --- Cash and the khata -----------------------------------------------------

export interface PaymentRow {
  id: string;
  customer_id: string;
  customer_name: string;
  order_id: string | null;
  order_no: number | null;
  /** Signed. A negative amount is a refund or a reversal. */
  amount: number;
  method: 'CASH';
  paid_on: string;
  note: string | null;
  created_at: string;
}

/** The day book. `range_total` covers the whole filter, not just this page. */
export function listPayments(
  args: PageArgs & {
    customerId?: string | null;
    orderId?: string | null;
    from?: string | null;
    to?: string | null;
  } = {},
): Promise<Page<PaymentRow> & { range_total: number }> {
  return callRpc('list_payments', {
    p_customer_id: args.customerId ?? null,
    p_order_id: args.orderId ?? null,
    p_from: args.from ?? null,
    p_to: args.to ?? null,
    ...page(args),
  });
}

export interface CustomerBalanceRow {
  customer_id: string;
  name: string;
  phone: string | null;
  total_billed: number;
  total_paid: number;
  outstanding: number;
  last_payment_on: string | null;
  last_order_at: string | null;
}

/** The khata screen: who owes what. Defaults to only those who owe something. */
export function listCustomerBalances(
  args: PageArgs & { search?: string | null; onlyOutstanding?: boolean } = {},
): Promise<Page<CustomerBalanceRow> & { outstanding_total: number }> {
  return callRpc('list_customer_balances', {
    p_search: args.search ?? null,
    p_only_outstanding: args.onlyOutstanding ?? true,
    ...page(args),
  });
}

export interface CustomerLedger {
  balance: {
    customer_id: string;
    name: string;
    total_billed: number;
    total_paid: number;
    outstanding: number;
  } | null;
  orders: Page<{
    id: string;
    order_no: number | null;
    status: OrderStatus;
    total_amount: number;
    placed_at: string;
    paid: number;
  }>;
  payments: Page<{
    id: string;
    amount: number;
    paid_on: string;
    order_id: string | null;
    note: string | null;
    created_at: string;
  }>;
}

export function getCustomerLedger(
  customerId: string,
  args: PageArgs = {},
): Promise<CustomerLedger> {
  return callRpc('get_customer_ledger', { p_customer_id: customerId, ...page(args) });
}

// --- Stock ------------------------------------------------------------------

export interface StockSnapshot {
  raw: Array<{
    raw_material_id: string;
    name: string;
    base_unit: 'g' | 'ml' | 'pcs';
    qty_base: number;
    reorder_level_base: number;
    below_reorder: boolean;
  }>;
  packed: Array<{
    packed_sku_id: string;
    name: string;
    pack_size_base: number;
    sale_price: number;
    qty_packets: number;
  }>;
}

export function getStockSnapshot(): Promise<StockSnapshot> {
  return callRpc<StockSnapshot>('get_stock_snapshot');
}

export type StockEntryType =
  | 'OPENING'
  | 'PURCHASE_IN'
  | 'PACK_OUT'
  | 'PACK_IN'
  | 'SALE_OUT'
  | 'RETURN_IN'
  | 'ADJUSTMENT';

export interface StockLedgerRow {
  id: string;
  entry_type: StockEntryType;
  item_kind: 'RAW' | 'PACKED';
  raw_material_id: string | null;
  packed_sku_id: string | null;
  item_name: string | null;
  /** Signed. Grams for RAW, packets for PACKED. */
  qty_base: number;
  ref_type: string | null;
  ref_id: string | null;
  note: string | null;
  created_at: string;
  created_by_name: string | null;
}

/**
 * The audit trail for one item. This is the answer to "the app says 12 and I
 * counted 10" -- without it a disagreement about stock has no evidence behind
 * it and the ledger model's whole advantage is invisible to the owner.
 */
export function listStockLedger(
  args: PageArgs & {
    rawMaterialId?: string | null;
    packedSkuId?: string | null;
    entryTypes?: StockEntryType[] | null;
  } = {},
): Promise<Page<StockLedgerRow>> {
  return callRpc('list_stock_ledger', {
    p_raw_material_id: args.rawMaterialId ?? null,
    p_packed_sku_id: args.packedSkuId ?? null,
    p_entry_types: args.entryTypes ?? null,
    ...page(args),
  });
}

// --- Home screen ------------------------------------------------------------

export interface DaySummary {
  on: string;
  orders_placed: number;
  orders_to_pack: number;
  orders_to_dispatch: number;
  orders_out: number;
  cash_collected: number;
  outstanding_total: number;
  low_stock_count: number;
}

/** One round trip for the whole home screen; six would be felt on 2G. */
export function getDaySummary(on?: string | null): Promise<DaySummary> {
  return callRpc('get_day_summary', { p_on: on ?? null });
}

// --- Staff ------------------------------------------------------------------

export interface MembersList {
  members: Array<{
    user_id: string;
    full_name: string;
    phone: string | null;
    role: MemberRole;
    is_active: boolean;
    created_at: string;
    is_self: boolean;
  }>;
  /** Live, unclaimed invites. Each one holds a seat until claimed or revoked. */
  invites: Array<{
    id: string;
    role: MemberRole;
    phone: string | null;
    email: string | null;
    token: string;
    expires_at: string;
    created_at: string;
  }>;
  seats: { limit: number; used: number; available: number };
}

/** OWNER only: the response carries live invite tokens. */
export function listMembers(): Promise<MembersList> {
  return callRpc<MembersList>('list_members');
}

// --- Receipts ---------------------------------------------------------------

export interface Receipt {
  business: { name: string; phone: string | null; address: string | null; gstin: string | null };
  order: {
    id: string;
    order_no: number | null;
    status: OrderStatus;
    placed_at: string;
    total_amount: number;
  };
  customer: { name: string; phone: string | null; address: string | null };
  items: Array<{
    name: string;
    pack_size_base: number;
    qty_packets: number;
    unit_price: number;
    line_total: number;
  }>;
  paid: number;
  balance: number;
  customer_outstanding: number;
  /**
   * Always PAYMENT_RECEIPT. Stated on the document so it is never mistaken for
   * a tax invoice -- which is also why the GSTIN toggle is free forever.
   */
  document_type: 'PAYMENT_RECEIPT';
}

/** The server decides what is on it, including whether the GSTIN shows. */
export function getReceipt(orderId: string): Promise<Receipt> {
  return callRpc<Receipt>('get_receipt', { p_order_id: orderId });
}
