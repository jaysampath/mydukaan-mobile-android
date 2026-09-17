import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/**
 * Connectivity.
 *
 * NetInfo used to be a sync dependency; now it feeds react-query's
 * onlineManager, which is what gives reads an automatic refetch the moment a
 * phone regains signal.
 *
 * `isInternetReachable === null` means the check is still pending. Treated as
 * online, on the same reasoning the old sync layer used: refusing to try is
 * worse than trying and failing, because a failure is retried anyway.
 */
function isOnline(state: { isConnected: boolean | null; isInternetReachable: boolean | null }) {
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

/**
 * Call once, before the app renders.
 *
 * Returns nothing: react-query owns the subscription for the lifetime of the
 * onlineManager, and the NetInfo unsubscribe it hands back is managed inside.
 */
export function startOnlineTracking(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(isOnline(state))),
  );
}

/** For the offline banner. */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(() => onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  return online;
}
