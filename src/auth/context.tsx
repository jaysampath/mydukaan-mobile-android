import { useMyContext as useMyContextQuery } from '../data/queries';
import type { MemberRole } from '../api/reads';
import { allowed, type Capability } from './roles';

/**
 * What this user may do, according to the server.
 *
 * A thin read over `get_my_context`, so role, features, seats and read-only
 * state all come from one call and one cache entry. The alternative -- each
 * screen deriving permission from its own fetch -- is how a role check ends up
 * disagreeing with itself between two tabs.
 */
export function useMe() {
  const query = useMyContextQuery();
  const ctx = query.data;

  const role: MemberRole | null = ctx?.profile?.role ?? null;
  const isReadOnly = ctx?.is_read_only ?? false;

  return {
    ...query,
    context: ctx,
    role,
    business: ctx?.business ?? null,
    membershipState: ctx?.membership_state,
    seats: ctx?.seats ?? null,
    /** Server-decided. Never recompute the subscription rule here. */
    isReadOnly,
    /** Per-business module toggle; gates the packing screens entirely. */
    hasPacking: ctx?.business?.features?.packing === true,
    /**
     * The one question a screen asks before rendering an action.
     * Combines role and plan, so a lapsed owner sees reads but not writes.
     */
    can: (capability: Capability) => allowed(role, capability, isReadOnly),
  };
}
