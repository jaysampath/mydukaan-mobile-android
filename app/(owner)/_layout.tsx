import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/auth/context';
import { tab } from '../../src/nav/tabIcon';
import { DrawerProvider, Loading, Screen } from '../../src/theme/components';
import { colors, space, type as typeScale } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * The owner/manager shell.
 *
 * OWNER and MANAGER share it because they differ by a handful of routes, and
 * duplicating the shell to hide three of them would be worse than guarding
 * those three. PACKER and DELIVERY get their own groups instead -- their app is
 * genuinely a different app, not this one with things removed.
 *
 * Four tabs for the hourly work; everything occasional (catalog, staff,
 * settings, profile, sign-out) lives in the side drawer behind the hamburger.
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
    <DrawerProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.page },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          /**
           * `edgeToEdgeEnabled: true` in app.config.ts means the app draws
           * behind the system bars, so the tab bar must be lifted clear of the
           * gesture/navigation area itself: an explicit height plus the real
           * bottom inset. A bare hardcoded height draws the system home button
           * straight through the labels.
           *
           * 64dp holds a 24dp icon over a 13pt label and clears the 48dp touch
           * minimum.
           */
          tabBarStyle: {
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            height: 64 + insets.bottom,
            paddingTop: space.sm,
            paddingBottom: insets.bottom + space.xs,
          },
          tabBarLabelStyle: {
            fontSize: typeScale.meta.fontSize,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen name="index" options={tab(t('home.title'), 'home')} />
        <Tabs.Screen name="orders" options={tab(t('orders.title'), 'receipt')} />
        <Tabs.Screen name="stock" options={tab(t('stock.title'), 'cube')} />
        <Tabs.Screen name="khata" options={tab(t('khata.title'), 'book')} />
        {/*
          catalog/ and more/ are route directories, so expo-router would
          register them as tabs. They are reached from the drawer instead --
          set up occasionally, not navigated to hourly -- so `href: null` keeps
          the routes while removing the tabs.
        */}
        <Tabs.Screen name="catalog" options={{ href: null }} />
        <Tabs.Screen name="more" options={{ href: null }} />
      </Tabs>
    </DrawerProvider>
  );
}
