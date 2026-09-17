import { keys } from './keys';

/**
 * Which caches a write invalidates.
 *
 * Stated as data rather than scattered through mutation hooks, so it can be
 * read in one go and unit-tested. The thing being prevented is subtle and
 * common: an owner records a payment, the order screen updates, and the khata
 * list still shows yesterday's balance because nobody remembered that
 * `record_payment` also changes `list_customer_balances` and the day summary.
 *
 * Ledger arithmetic makes this worse than usual. Nothing here is a stored
 * value: stock is SUM(qty_base) and outstanding is Σ(orders) − Σ(payments), so
 * one insert changes the answer to several unrelated-looking questions.
 * dispatch_order writes stock rows, which moves the stock snapshot, the order,
 * the order list AND the low-stock count on the home screen.
 */

type KeyList = readonly (readonly unknown[])[];

export type WriteOp =
  | 'upsert_customer'
  | 'upsert_supplier'
  | 'upsert_raw_material'
  | 'upsert_packed_sku'
  | 'archive_master'
  | 'create_purchase'
  | 'receive_purchase'
  | 'create_packing_run'
  | 'run_conversion'
  | 'create_order'
  | 'set_order_status'
  | 'dispatch_order'
  | 'record_payment'
  | 'record_stock_adjustment'
  | 'update_business_settings'
  | 'invite_member'
  | 'revoke_member_invite'
  | 'set_member_role'
  | 'set_member_active'
  | 'update_my_profile'
  | 'claim_invite';

/**
 * The keys to invalidate after `op`, given the ids it touched.
 *
 * Prefix keys are used on purpose: `keys.orders.all` catches every filtered
 * list, which is what you want when a status changed and you cannot know which
 * filters the user has open.
 */
export function invalidatedBy(
  op: WriteOp,
  ids: { orderId?: string; customerId?: string; purchaseId?: string } = {},
): KeyList {
  const day = [keys.daySummary()];

  switch (op) {
    case 'upsert_customer':
    case 'archive_master':
      return [keys.customers.all, keys.orders.all, keys.skus.all, keys.materials.all];

    case 'upsert_supplier':
      return [keys.suppliers.all, keys.purchases.all];

    case 'upsert_raw_material':
      return [keys.materials.all, keys.skus.all, keys.stock.all, ...day];

    case 'upsert_packed_sku':
      return [keys.skus.all, keys.stock.all];

    case 'create_purchase':
    case 'receive_purchase':
      // Receiving posts PURCHASE_IN rows, so stock moves too.
      return [keys.purchases.all, keys.stock.all, keys.materials.all, ...day];

    case 'create_packing_run':
    case 'run_conversion':
      // PACK_OUT and PACK_IN: bulk falls, packets rise. Both lists move.
      return [keys.packingRuns.all, keys.stock.all, keys.materials.all, keys.skus.all, ...day];

    case 'create_order':
      return [
        keys.orders.all,
        keys.customers.all,
        ...(ids.customerId ? [keys.customers.ledger(ids.customerId)] : []),
        ...day,
      ];

    case 'set_order_status':
      return [
        keys.orders.all,
        ...(ids.orderId ? [keys.orders.detail(ids.orderId)] : []),
        ...day,
      ];

    case 'dispatch_order':
      // Where stock actually leaves. The widest fan-out of any write.
      return [
        keys.orders.all,
        ...(ids.orderId ? [keys.orders.detail(ids.orderId)] : []),
        keys.stock.all,
        keys.skus.all,
        ...day,
      ];

    case 'record_payment':
      // Can also close the order, so the order itself is invalidated too.
      return [
        keys.payments.all,
        keys.orders.all,
        ...(ids.orderId ? [keys.orders.detail(ids.orderId), keys.orders.receipt(ids.orderId)] : []),
        keys.customers.all,
        ...(ids.customerId ? [keys.customers.ledger(ids.customerId)] : []),
        ...day,
      ];

    case 'record_stock_adjustment':
      return [keys.stock.all, keys.materials.all, keys.skus.all, ...day];

    case 'update_business_settings':
      // Carries the GSTIN toggle, which changes what a receipt shows.
      return [keys.context(), keys.orders.all];

    case 'invite_member':
    case 'revoke_member_invite':
    case 'set_member_role':
    case 'set_member_active':
      // Seats live on the context as well as the roster.
      return [keys.members(), keys.context()];

    case 'update_my_profile':
    case 'claim_invite':
      return [keys.context()];

    default:
      return [keys.context()];
  }
}
