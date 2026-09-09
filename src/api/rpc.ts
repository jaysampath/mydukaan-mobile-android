import { callRpc } from './supabase';

/**
 * The complete data-access surface of this app.
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

// --- Sync -------------------------------------------------------------------

export type SyncChanges = Record<
  string,
  { created: unknown[]; updated: unknown[]; deleted: string[] }
>;

/**
 * The sync wire-shape contract the server is running.
 *
 * `min_client` is the oldest client contract the server still supports. When it
 * exceeds the version this build was compiled with, the schema changed in a way
 * this build cannot survive and sync must stop. `current` merely being higher
 * is an additive change and is safe to ignore.
 */
export interface SchemaContract {
  current: number;
  min_client: number;
}

export interface SyncPullResult {
  changes: SyncChanges;
  timestamp: number;
  /** Absent on a server older than migration 0009. */
  contract?: SchemaContract;
}

export function syncPull(lastPulledAt: number | null): Promise<SyncPullResult> {
  return callRpc<SyncPullResult>('sync_pull', { last_pulled_at: lastPulledAt });
}

export function syncPush(changes: SyncChanges, lastPulledAt: number | null): Promise<{ ok: true }> {
  return callRpc<{ ok: true }>('sync_push', {
    changes,
    last_pulled_at: lastPulledAt,
  });
}

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
// Added in migration 0011 -- before it, these tables could only be written by
// sync_push, which pull_only mode does not use.

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

export interface StockSnapshot {
  raw: Array<{
    raw_material_id: string;
    name: string;
    base_unit: string;
    qty_base: number;
  }>;
  packed: Array<{
    packed_sku_id: string;
    name: string;
    pack_size_base: number;
    qty_packets: number;
  }>;
}

export function getStockSnapshot(): Promise<StockSnapshot> {
  return callRpc<StockSnapshot>('get_stock_snapshot');
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

export function setOrderStatus(orderId: string, status: SettableOrderStatus): Promise<unknown> {
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
}): Promise<{ created: boolean; customer_outstanding: number }> {
  return callRpc('record_payment', {
    p_payment_id: args.paymentId,
    p_customer_id: args.customerId,
    p_amount: args.amount,
    p_order_id: args.orderId ?? null,
    p_paid_on: args.paidOn ?? null,
    p_note: args.note ?? null,
  });
}

export function getCustomerLedger(customerId: string): Promise<unknown> {
  return callRpc('get_customer_ledger', { p_customer_id: customerId });
}

// --- Receipts ---------------------------------------------------------------

export interface Receipt {
  business: { name: string; phone: string | null; address: string | null; gstin: string | null };
  order: {
    id: string;
    order_no: number | null;
    status: string;
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
  document_type: 'PAYMENT_RECEIPT';
}

export function getReceipt(orderId: string): Promise<Receipt> {
  return callRpc<Receipt>('get_receipt', { p_order_id: orderId });
}
