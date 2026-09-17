import * as Crypto from 'expo-crypto';

/**
 * Mints a record id on the device.
 *
 * Every operation RPC takes the record's uuid from the caller, which is what
 * makes a retry safe: a phone that loses signal mid-call repeats the same call,
 * and the server recognises the id and reports `created: false` rather than
 * doing the work twice. `dispatch_order` twice deducts stock once;
 * `record_stock_adjustment` twice counts the shelf once.
 *
 * This mattered under offline sync too, for a different reason -- five phones
 * generating ids for a week without contact must not collide. That reason is
 * gone; the retry-safety one is not, and it is the one that protects money.
 *
 * Mint the id ONCE, where the user's intent begins (when a form opens, not when
 * Save is pressed), so that pressing Save twice, or pressing it after a timeout,
 * sends the same id. Generating it inside the submit handler defeats the whole
 * mechanism.
 *
 * expo-crypto is backed by the platform CSPRNG.
 */
export function newId(): string {
  return Crypto.randomUUID();
}
