import { contractPermitsUse } from '../api/contract';
import type { MemberRole, MembershipState } from '../api/reads';

/**
 * Where a signed-in user belongs.
 *
 * Extracted as a pure function specifically so it can be tested: this decides
 * what the whole app shows, it is security-adjacent UX, and it has more cases
 * than it looks.
 *
 * It replaces the worst line in the old codebase --
 *
 *   if (syncState.error.includes('not an active member')) showInviteForm()
 *
 * -- which decided the same thing by string-matching a server error message,
 * and which would have broken silently the first time that message was
 * reworded. `get_my_context` now returns `membership_state` for exactly this.
 */

export type Landing =
  | '/(auth)/sign-in'
  | '/(auth)/claim-invite'
  | '/(auth)/blocked'
  | '/(auth)/update-required'
  | '/(owner)'
  | '/(pack)'
  | '/(deliver)';

export interface LandingInput {
  hasSession: boolean;
  membershipState?: MembershipState;
  role?: MemberRole | null;
  /** The server's min_client. Undefined on a server predating the contract. */
  serverMinClient?: number;
}

export function resolveLanding(input: LandingInput, buildContract?: number): Landing {
  if (!input.hasSession) return '/(auth)/sign-in';

  // Checked before anything else, and before any data is rendered. If this
  // build cannot be trusted to read the payloads, showing a wrong rupee figure
  // is worse than showing an update prompt.
  if (!contractPermitsUse(input.serverMinClient, buildContract)) {
    return '/(auth)/update-required';
  }

  switch (input.membershipState) {
    case 'NONE':
      // Signed in, but not in a business yet: an operator created the business
      // and sent a code. There is deliberately no self-signup path.
      return '/(auth)/claim-invite';
    case 'INACTIVE':
      // Deactivated by their owner. Distinguishable from NONE only because of
      // the profiles_self_select policy added in migration 0017.
      return '/(auth)/blocked';
    case 'ACTIVE':
      break;
    default:
      // Context not loaded yet, or an unrecognised state. Do not guess into the
      // app; the caller shows a loading state for this.
      return '/(auth)/sign-in';
  }

  // A packer's app and a delivery person's app are genuinely different apps --
  // one or two screens, big targets, no tabs worth having -- so they get their
  // own route groups rather than a heavily-guarded shared shell.
  switch (input.role) {
    case 'PACKER':
      return '/(pack)';
    case 'DELIVERY':
      return '/(deliver)';
    case 'OWNER':
    case 'MANAGER':
      // These two differ by a handful of hidden routes, so they share a shell
      // and the differences are guarded per-route.
      return '/(owner)';
    default:
      return '/(auth)/sign-in';
  }
}
