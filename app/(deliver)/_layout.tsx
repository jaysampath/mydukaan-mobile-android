import { Redirect, Stack } from 'expo-router';

import { useMe } from '../../src/auth/context';
import { DrawerProvider, Loading, Screen } from '../../src/theme/components';
import { colors } from '../../src/theme/tokens';

/**
 * The delivery person's app.
 *
 * A plain stack, not tabs: there is one job -- work through today's run -- and
 * the user is walking while they do it. Tabs would be a navigation decision
 * they never need to make. The drawer carries the profile and sign-out.
 */
export default function DeliverLayout() {
  const me = useMe();

  if (me.isLoading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (!me.can('mark_delivered')) return <Redirect href="/" />;

  return (
    <DrawerProvider>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}
      />
    </DrawerProvider>
  );
}
