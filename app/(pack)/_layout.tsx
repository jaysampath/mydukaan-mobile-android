import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/auth/context';
import { tab } from '../../src/nav/tabIcon';
import { DrawerProvider, Loading, Screen } from '../../src/theme/components';
import { colors, space, type as typeScale } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * The packer's app.
 *
 * Its own route group rather than the owner shell with things hidden, because a
 * packer's app is genuinely a different app: one job, two screens, no prices,
 * no khata, no navigation depth. Reusing the owner shell and guarding most of
 * it would produce a worse experience for them and a more fragile one for us.
 *
 * The drawer is still here, for the profile and sign-out.
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
    <DrawerProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.page },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          // See the note in (owner)/_layout.tsx: edge-to-edge means the bar has
          // to clear the system navigation area by the real inset.
          tabBarStyle: {
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            height: 68 + insets.bottom,
            paddingTop: space.sm,
            paddingBottom: insets.bottom + space.xs,
          },
          // A packer's two tabs get larger labels than the owner's: this screen
          // is used with one thumb, at arm's length, often in poor light.
          tabBarLabelStyle: {
            fontSize: typeScale.secondary.fontSize,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen name="index" options={tab(t('packer.title'), 'cube')} />
        <Tabs.Screen name="runs" options={tab(t('packer.runs'), 'layers')} />
      </Tabs>
    </DrawerProvider>
  );
}
