import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * The on-device schema. Mirrors the `app` schema in Postgres, with three
 * deliberate differences:
 *
 *  1. No `business_id`. A device is signed into exactly one business, and the
 *     server derives the tenant from the JWT and ignores whatever the client
 *     sends. Carrying it locally would add a field that means nothing and can
 *     only ever be wrong.
 *
 *  2. No `deleted_at`. WatermelonDB owns deletion: the server reports soft-
 *     deleted rows in the `deleted` array of a pull, and Watermelon removes
 *     them locally. Modelling deleted_at as a column would fight that.
 *
 *  3. Server-assigned fields (order_no, purchase_no, line_total) are present
 *     but must be treated as read-only. They arrive on the next pull. See the
 *     note on order_no below.
 *
 * Units, matching the server: RAW quantities are in grams, PACKED quantities
 * are in whole packets.
 */
export const SCHEMA_VERSION = 2;

/**
 * The sync wire-shape contract this build was written against.
 *
 * The server reports `{current, min_client}` on every pull. If the server's
 * `min_client` exceeds this number, the schema changed in a way this build
 * cannot survive and sync stops with an update prompt rather than corrupting
 * local data. A server whose `current` is merely higher is additive and fine.
 *
 * Bump this when you adopt a server change. src/db/schema.contract.test.ts
 * fails if this repo drifts from mydukaan-backend.
 */
export const SCHEMA_CONTRACT_VERSION = 1;

export const schema = appSchema({
  version: SCHEMA_VERSION,
  tables: [
    tableSchema({
      name: 'businesses',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string', isOptional: true },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'gstin', type: 'string', isOptional: true },
        { name: 'show_gstin_on_receipt', type: 'boolean' },
        { name: 'currency', type: 'string' },
        { name: 'subscription_status', type: 'string' },
        { name: 'trial_ends_at', type: 'number', isOptional: true },
        { name: 'seat_limit', type: 'number' },
        // jsonb on the server; stored as raw JSON text here. Gates the packing
        // module -- see Business.features.
        { name: 'features', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'profiles',
      columns: [
        { name: 'full_name', type: 'string' },
        { name: 'phone', type: 'string', isOptional: true },
        { name: 'role', type: 'string', isIndexed: true },
        { name: 'is_active', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'raw_materials',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'sku_code', type: 'string', isOptional: true },
        { name: 'base_unit', type: 'string' },
        { name: 'reorder_level_base', type: 'number' },
        { name: 'is_active', type: 'boolean' },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'packed_skus',
      columns: [
        { name: 'raw_material_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'pack_size_base', type: 'number' },
        { name: 'sku_code', type: 'string', isOptional: true },
        { name: 'sale_price', type: 'number' },
        { name: 'is_active', type: 'boolean' },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'customers',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string', isOptional: true },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'suppliers',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string', isOptional: true },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'purchases',
      columns: [
        { name: 'supplier_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'purchase_no', type: 'number', isOptional: true },
        { name: 'invoice_no', type: 'string', isOptional: true },
        { name: 'purchased_on', type: 'string' },
        { name: 'total_amount', type: 'number' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'received_at', type: 'number', isOptional: true },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'purchase_items',
      columns: [
        { name: 'purchase_id', type: 'string', isIndexed: true },
        { name: 'raw_material_id', type: 'string', isIndexed: true },
        { name: 'qty_base', type: 'number' },
        { name: 'unit_cost_base', type: 'number' },
        { name: 'line_total', type: 'number' },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'packing_runs',
      columns: [
        { name: 'raw_material_id', type: 'string', isIndexed: true },
        { name: 'packed_sku_id', type: 'string', isIndexed: true },
        { name: 'packets_produced', type: 'number' },
        { name: 'raw_consumed_base', type: 'number' },
        { name: 'wastage_base', type: 'number' },
        { name: 'run_on', type: 'string' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'completed_at', type: 'number', isOptional: true },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'orders',
      columns: [
        { name: 'customer_id', type: 'string', isIndexed: true },
        // Server-assigned on first successful push. Null means "this order has
        // never reached the server". The UI shows a local reference until then
        // -- an offline device cannot know the next number without risking a
        // duplicate.
        { name: 'order_no', type: 'number', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'total_amount', type: 'number' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'placed_at', type: 'number' },
        { name: 'packed_at', type: 'number', isOptional: true },
        { name: 'dispatched_at', type: 'number', isOptional: true },
        { name: 'delivered_at', type: 'number', isOptional: true },
        { name: 'closed_at', type: 'number', isOptional: true },
        { name: 'cancelled_at', type: 'number', isOptional: true },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'order_items',
      columns: [
        { name: 'order_id', type: 'string', isIndexed: true },
        { name: 'packed_sku_id', type: 'string', isIndexed: true },
        { name: 'qty_packets', type: 'number' },
        { name: 'unit_price', type: 'number' },
        // Generated column server-side; read-only here.
        { name: 'line_total', type: 'number', isOptional: true },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // --- Append-only. Never update or delete a row in these two tables. ------
    tableSchema({
      name: 'stock_ledger',
      columns: [
        { name: 'entry_type', type: 'string', isIndexed: true },
        { name: 'item_kind', type: 'string' },
        { name: 'raw_material_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'packed_sku_id', type: 'string', isOptional: true, isIndexed: true },
        // Signed. Negative means stock leaving.
        { name: 'qty_base', type: 'number' },
        { name: 'ref_type', type: 'string', isOptional: true },
        { name: 'ref_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'note', type: 'string', isOptional: true },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'payments',
      columns: [
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'order_id', type: 'string', isOptional: true, isIndexed: true },
        // Signed. Negative rows are reversals; history is never edited.
        { name: 'amount', type: 'number' },
        { name: 'method', type: 'string' },
        { name: 'paid_on', type: 'string' },
        { name: 'note', type: 'string', isOptional: true },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
