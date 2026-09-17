import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { auth } from '../api/supabase';
import { clearCache } from '../data/queryClient';
import { env, type AuthMode } from '../env';

/**
 * Who is signed in.
 *
 * Deliberately separate from `useMyContext()` (which asks the server what this
 * user may do). A session is "GoTrue has a valid token"; a context is "this user
 * is an active OWNER of Test Spice Co". They fail independently: a valid session
 * with no membership is the normal state of a user who has not claimed an
 * invite yet.
 */

interface SessionValue {
  session: Session | null;
  /** True until the persisted session has been read off disk. */
  loading: boolean;
  authMode: AuthMode;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue>({
  session: null,
  loading: true,
  authMode: 'password',
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let alive = true;
    auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      loading,
      authMode: env.authMode,
      /**
       * Sign out, and take the cache with it.
       *
       * The cache clear is not housekeeping -- it is the difference between a
       * shared shop phone being safe and leaking. Persisted read caches live in
       * AsyncStorage keyed by query, not by user, so without this the next
       * person to sign in sees the previous business's customers, orders and
       * khata until each query happens to refetch. The server cannot prevent
       * that; the data is already on the device.
       *
       * The old WatermelonDB code had the identical hazard and never handled
       * it: Phase 0's sign-out called auth.signOut() and left the local
       * database exactly where it was.
       *
       * Order matters:
       *  1. Leave the signed-in screens. Nothing else routes on a lost session
       *     (the shells route on role), so without this the button appears to
       *     do nothing. Leaving first also means no mounted screen refetches
       *     into the cache we are about to clear.
       *  2. Drop the token. A global sign-out needs the network, and on
       *     failure supabase-js returns an error *and keeps the local session*,
       *     so fall back to a local sign-out -- a weak signal must never leave
       *     the phone signed in.
       *  3. Clear the cache in `finally`, so the data goes even if step 2 throws.
       */
      signOut: async () => {
        router.replace('/(auth)/sign-in');
        try {
          const { error } = await auth.signOut();
          if (error) await auth.signOut({ scope: 'local' });
        } finally {
          await clearCache(queryClient);
        }
      },
    }),
    [session, loading, queryClient],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  return useContext(Ctx);
}
