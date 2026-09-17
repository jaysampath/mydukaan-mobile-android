/**
 * The query-key factory.
 *
 * One place that knows what every cache entry is called, because the thing that
 * actually breaks in a react-query app is not fetching -- it is invalidation.
 * "I recorded the payment and the khata still shows the old balance" is the
 * most likely user-visible defect in this design, and it is always a key that
 * did not match.
 *
 * Keys are hierarchical, so invalidating a prefix invalidates everything under
 * it: `keys.orders.all` catches every filtered order list without enumerating
 * the filters.
 *
 * Pure data, no imports -- unit-testable, and safe to import anywhere.
 */

export const keys = {
  /** The launch call. Role, features, read-only state and seats all hang off it. */
  context: () => ['context'] as const,

  customers: {
    all: ['customers'] as const,
    list: (search?: string | null) => ['customers', 'list', search ?? ''] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
    ledger: (id: string) => ['customers', 'ledger', id] as const,
    balances: (search?: string | null, onlyOutstanding = true) =>
      ['customers', 'balances', search ?? '', onlyOutstanding] as const,
  },

  suppliers: {
    all: ['suppliers'] as const,
    list: (search?: string | null) => ['suppliers', 'list', search ?? ''] as const,
  },

  materials: {
    all: ['materials'] as const,
    list: (includeInactive = false) => ['materials', 'list', includeInactive] as const,
  },

  skus: {
    all: ['skus'] as const,
    list: (rawMaterialId?: string | null, includeInactive = false) =>
      ['skus', 'list', rawMaterialId ?? '', includeInactive] as const,
  },

  orders: {
    all: ['orders'] as const,
    list: (statuses?: readonly string[] | null, customerId?: string | null) =>
      ['orders', 'list', statuses?.join(',') ?? '', customerId ?? ''] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
    receipt: (id: string) => ['orders', 'receipt', id] as const,
  },

  purchases: {
    all: ['purchases'] as const,
    list: (supplierId?: string | null) => ['purchases', 'list', supplierId ?? ''] as const,
    detail: (id: string) => ['purchases', 'detail', id] as const,
  },

  packingRuns: {
    all: ['packingRuns'] as const,
    list: (status?: string | null) => ['packingRuns', 'list', status ?? ''] as const,
  },

  payments: {
    all: ['payments'] as const,
    list: (customerId?: string | null, from?: string | null, to?: string | null) =>
      ['payments', 'list', customerId ?? '', from ?? '', to ?? ''] as const,
  },

  stock: {
    all: ['stock'] as const,
    snapshot: () => ['stock', 'snapshot'] as const,
    ledger: (rawMaterialId?: string | null, packedSkuId?: string | null) =>
      ['stock', 'ledger', rawMaterialId ?? '', packedSkuId ?? ''] as const,
  },

  daySummary: (on?: string | null) => ['daySummary', on ?? 'today'] as const,

  members: () => ['members'] as const,
} as const;
