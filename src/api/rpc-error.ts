/**
 * The error every data call can throw.
 *
 * Deliberately in its own module, importing nothing. `supabase.ts` pulls in the
 * Supabase client, AsyncStorage and a URL polyfill -- the whole React Native
 * module graph -- which cannot load in a Node test runner. Anything that wants
 * to reason ABOUT an error (should we retry it, what do we tell the user) must
 * be testable without a device, so the type it reasons about cannot live next
 * to the transport.
 *
 * This is the same discipline the old src/sync/policy.ts kept, and for the same
 * reason.
 */
export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly hint: string | undefined,
    readonly fn: string,
  ) {
    super(message);
    this.name = 'RpcError';
  }

  /**
   * True when the server refused on authorization grounds, not bad input.
   * Covers "not your tenant", "wrong role" and "subscription lapsed" alike --
   * use `isReadOnly` to separate the last of those.
   */
  get isForbidden(): boolean {
    return this.code === '42501';
  }

  /** True when the refusal was specifically "your subscription lapsed". */
  get isReadOnly(): boolean {
    return this.hint === 'read_only';
  }
}
