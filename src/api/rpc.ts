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

export interface SyncPullResult {
  changes: SyncChanges;
  timestamp: number;
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
