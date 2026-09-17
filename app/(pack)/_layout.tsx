import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/auth/context';
import { Loading, Screen, StatusBanners } from '../../src/theme/components';
import { colors, space, type as typeScale } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * The packer's app.
 *
 * Its own route group rather than the owner shell with things hidden, because a
 * packer's app is genuinely a different app: one job, two screens, no prices,
 * no khata, no navigation depth. Reusing the five-tab shell and guarding most
 * of it would produce a worse experience for them and a more fragile one for us.
 */
export default function PackLayout() {
  const me = useMe();
  const insets = useSafeAreaInsets();

  if (me.isLoading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  // Owners and managers can pack too, so they are allowed in here; anyone else
  // goes back through the router to their own shell.
  if (!me.can('mark_packed')) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBanners />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          // See the note in (owner)/_layout.tsx: edge-to-edge means the bar has
          // to clear the system navigation area by the real inset.
          tabBarStyle: {
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            // An EXPLICIT height is required here. bottom-tabs derives its
            // height from the icon plus the label, so hiding the icon (below)
            // collapses the bar to nothing -- and `height: undefined` does not
            // restore the default, it just leaves it collapsed. 56dp clears the
            // 48dp touch minimum; the inset lifts it above the system nav.
            height: 56 + insets.bottom,
            paddingTop: space.xs,
            paddingBottom: insets.bottom,
          },
          tabBarIcon: () => null,
          tabBarIconStyle: { display: 'none' },
          // A packer's two tabs get body-sized labels: this screen is used with
          // one thumb, at arm's length, often in poor light.
          tabBarLabelStyle: {
            fontSize: typeScale.body.fontSize,
            fontWeight: '600',
            marginBottom: 0,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t('packer.title') }} />
        <Tabs.Screen name="runs" options={{ title: t('packer.runs') }} />
      </Tabs>
    </View>
  );
}
