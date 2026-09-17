/**
 * The API shape this build was written against.
 *
 * No imports, on purpose -- see rpc-error.ts. The version comparison has to be
 * testable in Node, and the network call that fetches the server's side of it
 * lives in reads.ts with the other reads.
 *
 * There is no local database any more (docs/adr/0003-remove-offline-sync.md),
 * so the old *schema* contract is gone -- but the risk it guarded is not, and is
 * arguably larger now. Every screen destructures a server-side jsonb payload by
 * string key. If `get_order` renames `balance`, an old build does not fail; it
 * renders `undefined` where a rupee figure should be, on the screen where
 * someone is collecting cash. With no schema on the device there is nothing to
 * diff, so a version handshake is the only mechanism left.
 *
 * Bump this when adopting a server change.
 */
export const API_CONTRACT_VERSION = 1;

export interface ApiContract {
  /** Bumps on any change to a read or write payload shape. Informational. */
  current: number;
  /**
   * The oldest client this server still supports. When it exceeds
   * API_CONTRACT_VERSION, this build cannot be trusted to read the payloads and
   * must prompt for an update rather than render wrong numbers.
   */
  min_client: number;
}

/**
 * Whether a server contract permits this build to run.
 *
 * An absent contract counts as compatible -- refusing it would strand every
 * install the moment the check shipped, and a server that old predates the
 * concept entirely.
 *
 * Only `min_client` gates. A higher `current` is an additive change this build
 * can safely ignore.
 */
export function contractPermitsUse(
  serverMinClient: number | undefined,
  buildContract: number = API_CONTRACT_VERSION,
): boolean {
  return serverMinClient === undefined || serverMinClient <= buildContract;
}
