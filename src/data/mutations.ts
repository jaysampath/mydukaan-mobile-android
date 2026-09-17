import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import * as rpc from '../api/rpc';
import { invalidatedBy, type WriteOp } from './invalidate';

/**
 * One hook per write RPC.
 *
 * Two things every hook here does, and neither is optional:
 *
 * 1. **Invalidates via `invalidatedBy`.** The fan-out is stated once, as data,
 *    in ./invalidate.ts. Ledger arithmetic makes this wider than it looks:
 *    nothing is a stored value, so one insert changes the answer to several
 *    unrelated-looking questions.
 *
 * 2. **`networkMode: 'always'` on the financial ones.** react-query's default
 *    PAUSES a mutation while offline and fires it on reconnect. For a to-do app
 *    that is a feature; for `record_payment` it is a liability -- a payment that
 *    silently posts twenty minutes later, after the user walked away believing
 *    it failed, is worse than a refusal. These fail fast instead, and the screen
 *    keeps the form filled so it can be retried deliberately.
 *
 *    This is the honest replacement for the old `OfflineWriteBlockedError`: the
 *    same promise to the user, without pretending anything was saved.
 */

function opts(client: QueryClient, op: WriteOp, ids: () => Parameters<typeof invalidatedBy>[1] = () => ({})) {
  return {
    onSuccess: () => {
      for (const key of invalidatedBy(op, ids())) {
        client.invalidateQueries({ queryKey: key as unknown[] });
      }
    },
  };
}

// --- Masters ----------------------------------------------------------------

export function useSaveCustomer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: rpc.upsertCustomer,
    ...opts(client, 'upsert_customer'),
  });
}

export function useSaveSupplier() {
  const client = useQueryClient();
  return useMutation({ mutationFn: rpc.upsertSupplier, ...opts(client, 'upsert_supplier') });
}

export function useSaveRawMaterial() {
  const client = useQueryClient();
  return useMutation({ mutationFn: rpc.upsertRawMaterial, ...opts(client, 'upsert_raw_material') });
}

export function useSavePackedSku() {
  const client = useQueryClient();
  return useMutation({ mutationFn: rpc.upsertPackedSku, ...opts(client, 'upsert_packed_sku') });
}

export function useArchiveMaster() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { table: rpc.ArchivableTable; id: string }) =>
      rpc.archiveMaster(args.table, args.id),
    ...opts(client, 'archive_master'),
  });
}

// --- Inventory --------------------------------------------------------------

export function useCreatePurchase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: rpc.createPurchase,
    networkMode: 'always' as const,
    ...opts(client, 'create_purchase'),
  });
}

export function useReceivePurchase() {
  const client = useQueryClient();
  return useMutation({ mutationFn: rpc.receivePurchase, ...opts(client, 'receive_purchase') });
}

/** Opening balances, stock-take corrections and returns. */
export function useAdjustStock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: rpc.recordStockAdjustment,
    // Counting a shelf is not something to replay silently later.
    networkMode: 'always' as const,
    ...opts(client, 'record_stock_adjustment'),
  });
}

export function useCreatePackingRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: rpc.createPackingRun,
    networkMode: 'always' as const,
    ...opts(client, 'create_packing_run'),
  });
}

// --- Orders -----------------------------------------------------------------

export function useCreateOrder() {
  const client = useQueryClient();
  let customerId: string | undefined;
  return useMutation({
    mutationFn: (args: {
      orderId: string;
      customerId: string;
      items: rpc.OrderItemInput[];
      notes?: string;
    }) => {
      customerId = args.customerId;
      return rpc.createOrder(args.orderId, args.customerId, args.items, args.notes);
    },
    networkMode: 'always' as const,
    ...opts(client, 'create_order', () => ({ customerId })),
  });
}

export function useSetOrderStatus() {
  const client = useQueryClient();
  let orderId: string | undefined;
  return useMutation({
    mutationFn: (args: { orderId: string; status: rpc.SettableOrderStatus }) => {
      orderId = args.orderId;
      return rpc.setOrderStatus(args.orderId, args.status);
    },
    ...opts(client, 'set_order_status', () => ({ orderId })),
  });
}

/**
 * Where stock actually leaves.
 *
 * Idempotent server-side: a second call returns `already_dispatched: true` and
 * deducts nothing. The dispatch screen renders that as success, not an error --
 * it means the retry path worked.
 */
export function useDispatchOrder() {
  const client = useQueryClient();
  let orderId: string | undefined;
  return useMutation({
    mutationFn: (id: string) => {
      orderId = id;
      return rpc.dispatchOrder(id);
    },
    networkMode: 'always' as const,
    ...opts(client, 'dispatch_order', () => ({ orderId })),
  });
}

// --- Cash -------------------------------------------------------------------

export function useRecordPayment() {
  const client = useQueryClient();
  let ids: { orderId?: string; customerId?: string } = {};
  return useMutation({
    mutationFn: (args: {
      paymentId: string;
      customerId: string;
      amount: number;
      orderId?: string;
      paidOn?: string;
      note?: string;
    }) => {
      ids = { orderId: args.orderId, customerId: args.customerId };
      return rpc.recordPayment(args);
    },
    // The single most important 'always' in the app.
    networkMode: 'always' as const,
    ...opts(client, 'record_payment', () => ids),
  });
}

// --- Settings & staff -------------------------------------------------------

export function useUpdateBusinessSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: rpc.updateBusinessSettings,
    ...opts(client, 'update_business_settings'),
  });
}

export function useUpdateMyProfile() {
  const client = useQueryClient();
  return useMutation({ mutationFn: rpc.updateMyProfile, ...opts(client, 'update_my_profile') });
}

export function useInviteMember() {
  const client = useQueryClient();
  return useMutation({ mutationFn: rpc.inviteMember, ...opts(client, 'invite_member') });
}

export function useRevokeMemberInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: rpc.revokeMemberInvite,
    ...opts(client, 'revoke_member_invite'),
  });
}

export function useSetMemberRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { userId: string; role: rpc.MemberRoleInput }) =>
      rpc.setMemberRole(args.userId, args.role),
    ...opts(client, 'set_member_role'),
  });
}

export function useSetMemberActive() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { userId: string; isActive: boolean }) =>
      rpc.setMemberActive(args.userId, args.isActive),
    ...opts(client, 'set_member_active'),
  });
}

export function useClaimInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { token: string; fullName: string }) =>
      rpc.claimInvite(args.token, args.fullName),
    networkMode: 'always' as const,
    ...opts(client, 'claim_invite'),
  });
}
