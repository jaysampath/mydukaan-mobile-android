import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '../src/auth/session';
import { cacheBuster, createQueryClient, persister } from '../src/data/queryClient';
import { startOnlineTracking } from '../src/data/online';
import { AppErrorBoundary } from '../src/error/AppErrorBoundary';
import { colors } from '../src/theme/tokens';

/**
 * The root.
 *
 * Provider order matters: the query client has to exist before SessionProvider,
 * because signing out clears the cache and therefore needs a client to clear.
 */
export default function RootLayout() {
  // One client for the app's lifetime. Created in state rather than at module
  // scope so a fast refresh does not leave two clients fighting over the cache.
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    startOnlineTracking();
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        // A contract bump wipes the cache, so a payload written under the old
        // shape is never handed to code expecting the new one.
        buster: cacheBuster,
        maxAge: 24 * 60 * 60 * 1000,
      }}
    >
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <AppErrorBoundary>
          <SessionProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.page },
              }}
            />
          </SessionProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}
