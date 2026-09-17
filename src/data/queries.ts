import { useQuery } from '@tanstack/react-query';

import * as reads from '../api/reads';
import { keys } from './keys';

/**
 * One hook per read RPC.
 *
 * Components never call `reads.*` directly and never call fetch. That is what
 * keeps caching, retry and invalidation in one place instead of spread across
 * thirty screens.
 *
 * `staleTime` is set per query rather than globally, because the cost of stale
 * data is not uniform. A product list can be a minute old with no consequence.
 * A balance someone is about to collect against cannot be stale at all, so the
 * money queries use 0 and always revalidate before anyone acts on them.
 */

/** Anything involving an amount someone might act on. */
const MONEY = 0;
/** Lists that change when someone else in the shop does something. */
const LIVE = 15_000;
/** Reference data that changes when the owner edits it. */
const REFERENCE = 60_000;

export function useMyContext() {
  return useQuery({
    queryKey: keys.context(),
    queryFn: reads.getMyContext,
    // Role, features, seats and read-only state all come from here, so the
    // whole app is wrong if it is wrong. Short stale time, and it is cheap.
    staleTime: LIVE,
    retry: 2,
  });
}

export function useDaySummary(on?: string | null) {
  return useQuery({
    queryKey: keys.daySummary(on),
    queryFn: () => reads.getDaySummary(on),
    staleTime: MONEY,
  });
}

// --- Masters ----------------------------------------------------------------

export function useCustomers(search?: string | null) {
  return useQuery({
    queryKey: keys.customers.list(search),
    queryFn: () => reads.listCustomers({ search }),
    staleTime: REFERENCE,
  });
}

export function useSuppliers(search?: string | null, enabled = true) {
  return useQuery({
    queryKey: keys.suppliers.list(search),
    queryFn: () => reads.listSuppliers({ search }),
    staleTime: REFERENCE,
    enabled,
  });
}

export function useRawMaterials(includeInactive = false) {
  return useQuery({
    queryKey: keys.materials.list(includeInactive),
    queryFn: () => reads.listRawMaterials(includeInactive),
    staleTime: LIVE,
  });
}

export function usePackedSkus(rawMaterialId?: string | null, includeInactive = false) {
  return useQuery({
    queryKey: keys.skus.list(rawMaterialId, includeInactive),
    queryFn: () => reads.listPackedSkus({ rawMaterialId, includeInactive }),
    staleTime: LIVE,
  });
}

// --- Orders -----------------------------------------------------------------

export function useOrders(
  args: { statuses?: reads.OrderStatus[] | null; customerId?: string | null } = {},
) {
  return useQuery({
    queryKey: keys.orders.list(args.statuses, args.customerId),
    queryFn: () => reads.listOrders(args),
    staleTime: LIVE,
  });
}

export function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: keys.orders.detail(orderId ?? ''),
    queryFn: () => reads.getOrder(orderId as string),
    enabled: !!orderId,
    // Carries the balance and allowed_transitions, both of which gate actions.
    staleTime: MONEY,
  });
}

export function useReceipt(orderId: string | undefined) {
  return useQuery({
    queryKey: keys.orders.receipt(orderId ?? ''),
    queryFn: () => reads.getReceipt(orderId as string),
    enabled: !!orderId,
    staleTime: MONEY,
  });
}

// --- Purchases & packing ----------------------------------------------------

export function usePurchases(supplierId?: string | null, enabled = true) {
  return useQuery({
    queryKey: keys.purchases.list(supplierId),
    queryFn: () => reads.listPurchases({ supplierId }),
    staleTime: LIVE,
    enabled,
  });
}

export function usePurchase(purchaseId: string | undefined) {
  return useQuery({
    queryKey: keys.purchases.detail(purchaseId ?? ''),
    queryFn: () => reads.getPurchase(purchaseId as string),
    enabled: !!purchaseId,
    staleTime: LIVE,
  });
}

export function usePackingRuns(status?: string | null) {
  return useQuery({
    queryKey: keys.packingRuns.list(status),
    queryFn: () => reads.listPackingRuns({ status }),
    staleTime: LIVE,
  });
}

// --- Cash and the khata -----------------------------------------------------

export function usePayments(
  args: { customerId?: string | null; from?: string | null; to?: string | null } = {},
) {
  return useQuery({
    queryKey: keys.payments.list(args.customerId, args.from, args.to),
    queryFn: () => reads.listPayments(args),
    staleTime: MONEY,
  });
}

export function useCustomerBalances(search?: string | null, onlyOutstanding = true) {
  return useQuery({
    queryKey: keys.customers.balances(search, onlyOutstanding),
    queryFn: () => reads.listCustomerBalances({ search, onlyOutstanding }),
    staleTime: MONEY,
  });
}

export function useCustomerLedger(customerId: string | undefined) {
  return useQuery({
    queryKey: keys.customers.ledger(customerId ?? ''),
    queryFn: () => reads.getCustomerLedger(customerId as string),
    enabled: !!customerId,
    staleTime: MONEY,
  });
}

// --- Stock ------------------------------------------------------------------

export function useStock() {
  return useQuery({
    queryKey: keys.stock.snapshot(),
    queryFn: reads.getStockSnapshot,
    staleTime: LIVE,
  });
}

export function useStockLedger(args: { rawMaterialId?: string | null; packedSkuId?: string | null }) {
  return useQuery({
    queryKey: keys.stock.ledger(args.rawMaterialId, args.packedSkuId),
    queryFn: () => reads.listStockLedger(args),
    staleTime: LIVE,
  });
}

// --- Staff ------------------------------------------------------------------

export function useMembers(enabled = true) {
  return useQuery({
    queryKey: keys.members(),
    queryFn: reads.listMembers,
    staleTime: REFERENCE,
    enabled,
  });
}
