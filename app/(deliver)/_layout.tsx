import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';

import { useMe } from '../../src/auth/context';
import { Loading, Screen, StatusBanners } from '../../src/theme/components';
import { colors } from '../../src/theme/tokens';

/**
 * The delivery person's app.
 *
 * A plain stack, not tabs: there is one job -- work through today's run -- and
 * the user is walking while they do it. Tabs would be a navigation decision
 * they never need to make.
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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBanners />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
