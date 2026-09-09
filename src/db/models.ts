import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, text, relation } from '@nozbe/watermelondb/decorators';

/**
 * WatermelonDB models.
 *
 * All in one file because they are thin: the interesting logic lives in
 * src/domain (platform-agnostic, no React, no Watermelon) so it can be reasoned
 * about and tested without a device.
 *
 * `created_at` / `updated_at` are @readonly on purpose. The server owns them --
 * a device clock that is wrong by a day would otherwise corrupt the sync
 * cursor for everyone in the business.
 */

export class Business extends Model {
  static table = 'businesses';

  @text('name') name!: string;
  @text('phone') phone?: string;
  @text('address') address?: string;
  @text('gstin') gstin?: string;
  @field('show_gstin_on_receipt') showGstinOnReceipt!: boolean;
  @text('currency') currency!: string;
  @text('subscription_status') subscriptionStatus!: 'TRIAL' | 'ACTIVE' | 'LAPSED';
  @date('trial_ends_at') trialEndsAt?: Date;
  @field('seat_limit') seatLimit!: number;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  /** Lapsed means read-only, never data-locked. Nothing is ever withheld. */
  get isReadOnly(): boolean {
    if (this.subscriptionStatus === 'ACTIVE') return false;
    if (this.subscriptionStatus === 'TRIAL') {
      return this.trialEndsAt ? this.trialEndsAt.getTime() <= Date.now() : false;
    }
    return true;
  }
}

export class Profile extends Model {
  static table = 'profiles';

  @text('full_name') fullName!: string;
  @text('phone') phone?: string;
  @text('role') role!: 'OWNER' | 'MANAGER' | 'PACKER' | 'DELIVERY';
  @field('is_active') isActive!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class RawMaterial extends Model {
  static table = 'raw_materials';

  @text('name') name!: string;
  @text('sku_code') skuCode?: string;
  /** Ledger base unit. Grams for anything weighed. */
  @text('base_unit') baseUnit!: string;
  @field('reorder_level_base') reorderLevelBase!: number;
  @field('is_active') isActive!: boolean;
  @text('created_by') createdBy?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class PackedSku extends Model {
  static table = 'packed_skus';

  @text('raw_material_id') rawMaterialId!: string;
  @text('name') name!: string;
  /** Grams of raw material in one packet: 1000, 500, 250, 100, 50. */
  @field('pack_size_base') packSizeBase!: number;
  @text('sku_code') skuCode?: string;
  @field('sale_price') salePrice!: number;
  @field('is_active') isActive!: boolean;
  @text('created_by') createdBy?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('raw_materials', 'raw_material_id') rawMaterial!: RawMaterial;
}

export class Customer extends Model {
  static table = 'customers';

  @text('name') name!: string;
  @text('phone') phone?: string;
  @text('address') address?: string;
  @text('notes') notes?: string;
  @text('created_by') createdBy?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class Supplier extends Model {
  static table = 'suppliers';

  @text('name') name!: string;
  @text('phone') phone?: string;
  @text('address') address?: string;
  @text('notes') notes?: string;
  @text('created_by') createdBy?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class Purchase extends Model {
  static table = 'purchases';

  @text('supplier_id') supplierId?: string;
  @field('purchase_no') purchaseNo?: number;
  @text('invoice_no') invoiceNo?: string;
  @text('purchased_on') purchasedOn!: string;
  @field('total_amount') totalAmount!: number;
  @text('notes') notes?: string;
  @text('status') status!: 'DRAFT' | 'RECEIVED' | 'CANCELLED';
  @date('received_at') receivedAt?: Date;
  @text('created_by') createdBy?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class PurchaseItem extends Model {
  static table = 'purchase_items';

  @text('purchase_id') purchaseId!: string;
  @text('raw_material_id') rawMaterialId!: string;
  @field('qty_base') qtyBase!: number;
  @field('unit_cost_base') unitCostBase!: number;
  @field('line_total') lineTotal!: number;
  @text('created_by') createdBy?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class PackingRun extends Model {
  static table = 'packing_runs';

  @text('raw_material_id') rawMaterialId!: string;
  @text('packed_sku_id') packedSkuId!: string;
  @field('packets_produced') packetsProduced!: number;
  @field('raw_consumed_base') rawConsumedBase!: number;
  /** Spillage is recorded, not inferred, so the ledger balances honestly. */
  @field('wastage_base') wastageBase!: number;
  @text('run_on') runOn!: string;
  @text('notes') notes?: string;
  @text('status') status!: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  @date('completed_at') completedAt?: Date;
  @text('created_by') createdBy?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export type OrderStatus =
  | 'PLACED'
  | 'PACKED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'PAYMENT_PENDING'
  | 'CLOSED'
  | 'CANCELLED';

export class Order extends Model {
  static table = 'orders';

  @text('customer_id') customerId!: string;
  /** Null until the order has reached the server at least once. */
  @field('order_no') orderNo?: number;
  @text('status') status!: OrderStatus;
  @field('total_amount') totalAmount!: number;
  @text('notes') notes?: string;
  @date('placed_at') placedAt!: Date;
  @date('packed_at') packedAt?: Date;
  @date('dispatched_at') dispatchedAt?: Date;
  @date('delivered_at') deliveredAt?: Date;
  @date('closed_at') closedAt?: Date;
  @date('cancelled_at') cancelledAt?: Date;
  @text('created_by') createdBy?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('customers', 'customer_id') customer!: Customer;

  /** Stock has left the shelf from OUT_FOR_DELIVERY onwards. */
  get isDispatched(): boolean {
    return (
      this.status === 'OUT_FOR_DELIVERY' ||
      this.status === 'DELIVERED' ||
      this.status === 'PAYMENT_PENDING' ||
      this.status === 'CLOSED'
    );
  }
}

export class OrderItem extends Model {
  static table = 'order_items';

  @text('order_id') orderId!: string;
  @text('packed_sku_id') packedSkuId!: string;
  @field('qty_packets') qtyPackets!: number;
  @field('unit_price') unitPrice!: number;
  @field('line_total') lineTotal?: number;
  @text('created_by') createdBy?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('orders', 'order_id') order!: Order;
  @relation('packed_skus', 'packed_sku_id') packedSku!: PackedSku;
}

export type StockEntryType =
  | 'OPENING'
  | 'PURCHASE_IN'
  | 'PACK_OUT'
  | 'PACK_IN'
  | 'SALE_OUT'
  | 'RETURN_IN'
  | 'ADJUSTMENT';

/**
 * APPEND-ONLY. Never call .update() or .destroyPermanently() on this model --
 * the server rejects both, so the local change would only fail at sync time.
 * To correct a mistake, insert a row with the opposite sign.
 */
export class StockLedgerEntry extends Model {
  static table = 'stock_ledger';

  @text('entry_type') entryType!: StockEntryType;
  @text('item_kind') itemKind!: 'RAW' | 'PACKED';
  @text('raw_material_id') rawMaterialId?: string;
  @text('packed_sku_id') packedSkuId?: string;
  /** Signed. Grams for RAW, packets for PACKED. Negative = leaving. */
  @field('qty_base') qtyBase!: number;
  @text('ref_type') refType?: 'PURCHASE' | 'PACKING_RUN' | 'ORDER' | 'MANUAL';
  @text('ref_id') refId?: string;
  @text('note') note?: string;
  @text('created_by') createdBy?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

/** APPEND-ONLY, same rules as StockLedgerEntry. */
export class Payment extends Model {
  static table = 'payments';

  @text('customer_id') customerId!: string;
  @text('order_id') orderId?: string;
  /** Signed. Negative rows are reversals. */
  @field('amount') amount!: number;
  @text('method') method!: 'CASH';
  @text('paid_on') paidOn!: string;
  @text('note') note?: string;
  @text('created_by') createdBy?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export const modelClasses = [
  Business,
  Profile,
  RawMaterial,
  PackedSku,
  Customer,
  Supplier,
  Purchase,
  PurchaseItem,
  PackingRun,
  Order,
  OrderItem,
  StockLedgerEntry,
  Payment,
];
