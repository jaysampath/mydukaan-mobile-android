import { RpcError } from '../api/rpc-error';

/**
 * Turning a server refusal into something a shopkeeper can act on, and deciding
 * whether it is worth retrying.
 *
 * Deliberately pure and free of React Native imports, so it is testable in
 * Node. This is the file that used to be src/sync/policy.ts in spirit: the
 * decisions worth getting right, separated from the machinery.
 */

/** The SQLSTATEs this API raises on purpose. */
const REFUSAL_CODES = new Set([
  '42501', // authorization: wrong tenant, wrong role, or subscription lapsed
  '22023', // invalid input: a validation message written for a person
  '23514', // check violation: a business rule said no (seat cap, last owner)
  'P0002', // not found
  '23505', // unique violation
]);

/**
 * Whether a failed request is worth sending again.
 *
 * This is the important one. Retrying a 42501 three times with backoff turns
 * "you don't have permission" into a four-second hang and hammers a server that
 * is never going to say yes. Only transport failures get retried; a considered
 * refusal is final.
 */
export function shouldRetry(error: unknown, attempt = 0, maxAttempts = 3): boolean {
  if (attempt >= maxAttempts) return false;
  if (error instanceof RpcError) {
    return !REFUSAL_CODES.has(error.code ?? '');
  }
  // Anything that is not an RpcError got no further than the network.
  return true;
}

export type ErrorKind =
  | 'read_only'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'rule'
  | 'offline'
  | 'unknown';

export interface FriendlyError {
  kind: ErrorKind;
  /** Shown to the user. */
  message: string;
  /** True when trying the same thing again could plausibly work. */
  retryable: boolean;
  /** The server's hint, where it set one (read_only, seat_limit, last_owner). */
  hint?: string;
}

/**
 * Maps an error to something worth showing.
 *
 * Note what this does NOT do: invent copy for 22023 and 23514. Those messages
 * are written in SQL for a person to read -- "all 5 seats are in use; free one
 * before inviting someone else", "this item already has an opening balance" --
 * and paraphrasing them here would lose the specifics that make them useful.
 * The server knows which SKU was short and by how much; this file does not.
 */
export function mapRpcError(error: unknown): FriendlyError {
  if (error instanceof RpcError) {
    if (error.isReadOnly) {
      return {
        kind: 'read_only',
        // Never a data lock. The subscription promise is that you always keep
        // your own books; you just cannot add to them until it is renewed.
        message: 'Your subscription has lapsed, so the app is read-only. Your data is all still here.',
        retryable: false,
        hint: error.hint,
      };
    }
    if (error.isForbidden) {
      return {
        kind: 'forbidden',
        message: 'You do not have permission to do that.',
        retryable: false,
      };
    }
    if (error.code === 'P0002') {
      return { kind: 'not_found', message: 'That record no longer exists.', retryable: false };
    }
    if (error.code === '23514') {
      return { kind: 'rule', message: error.message, retryable: false, hint: error.hint };
    }
    if (error.code === '22023' || error.code === '23505') {
      return { kind: 'validation', message: error.message, retryable: false, hint: error.hint };
    }
    return { kind: 'unknown', message: error.message, retryable: true };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/network|fetch|timeout|Failed to fetch|Network request failed/i.test(message)) {
    return {
      kind: 'offline',
      message: 'No connection. Check your network and try again.',
      retryable: true,
    };
  }
  return { kind: 'unknown', message: 'Something went wrong.', retryable: true };
}

/** For the read-only banner: did this specific failure mean "lapsed"? */
export function isReadOnlyRefusal(error: unknown): boolean {
  return error instanceof RpcError && error.isReadOnly;
}
