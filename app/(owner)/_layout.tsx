import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/auth/context';
import { Loading, Screen, StatusBanners } from '../../src/theme/components';
import { colors, space, type as typeScale } from '../../src/theme/tokens';

/**
 * The owner/manager shell.
 *
 * OWNER and MANAGER share it because they differ by a handful of routes, and
 * duplicating a five-tab shell to hide three of them would be worse than
 * guarding those three. PACKER and DELIVERY get their own groups instead --
 * their app is genuinely a different app, not this one with things removed.
 */
export default function OwnerLayout() {
  const me = useMe();
  const insets = useSafeAreaInsets();

  if (me.isLoading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  // A packer who deep-links here gets sent to their own shell. This is UX, not
  // security -- every RPC re-checks the role server-side.
  if (me.role !== 'OWNER' && me.role !== 'MANAGER') {
    return <Redirect href="/" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBanners />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          /**
           * `edgeToEdgeEnabled: true` in app.config.ts means the app draws
           * behind the system bars, so the tab bar must be lifted clear of the
           * gesture/navigation area itself. A hardcoded height cannot do that:
           * it overrides react-navigation's inset-aware sizing and the home
           * button ends up drawn straight through the labels.
           *
           * So: set the height explicitly and add the real bottom inset to it.
           */
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
          /**
           * Text-only tabs. No icon set is installed, and for this audience a
           * word is clearer than a glyph -- but react-navigation renders a
           * placeholder box when `tabBarIcon` is absent, which is worse than
           * either. Returning null removes it and leaves the label room to be
           * legible at 15pt.
           */
          tabBarIcon: () => null,
          tabBarLabelStyle: {
            fontSize: typeScale.secondary.fontSize,
            fontWeight: '600',
            marginBottom: 0,
          },
          tabBarIconStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
        <Tabs.Screen name="stock" options={{ title: 'Stock' }} />
        <Tabs.Screen name="khata" options={{ title: 'Khata' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
        {/*
          catalog/ is a route directory, so expo-router registers it as a tab
          automatically. It is reached from More instead -- products and people
          are set up occasionally, not navigated to hourly -- so it is hidden
          from the bar rather than deleted. `href: null` keeps the routes
          reachable while removing the tab.
        */}
        <Tabs.Screen name="catalog" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
