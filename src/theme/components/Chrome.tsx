import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useMe } from '../../auth/context';
import { useIsOnline } from '../../data/online';
import { Banner } from './Layout';
import { useDrawer } from './Drawer';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, space, touch } from '../tokens';
import { t } from '../../i18n';

/**
 * The two persistent messages.
 *
 * Both are states, not events, which is why they are banners rather than
 * toasts:
 *
 *   read-only  the subscription lapsed. The user needs to understand why
 *              nothing will save BEFORE they try, and the copy has to say the
 *              data is still theirs -- a lapse is read-only, never a data lock.
 *   offline    reads are coming from the persisted cache. Writes will fail
 *              fast rather than queue, so saying so up front is honest.
 *
 * Rendered by <Header>, under the title bar. They used to sit above the shell,
 * which with edge-to-edge put them underneath the system status bar.
 */
export function StatusBanners() {
  const me = useMe();
  const online = useIsOnline();

  return (
    <>
      {!online ? (
        <Banner tone="warning" title={t('offline.title')} detail={t('offline.detail')} />
      ) : null}
      {me.isReadOnly ? (
        <Banner tone="danger" title={t('readOnly.title')} detail={t('readOnly.detail')} />
      ) : null}
    </>
  );
}

/**
 * The app bar.
 *
 * Hand-rolled rather than using the Stack header so both buttons are always
 * large enough (48dp) and the title can use our own type scale.
 *
 * `back={false}` marks a top-level screen. Those get the hamburger that opens
 * the side drawer instead of a back arrow -- every root screen already passed
 * `back={false}`, so they all got the menu without a per-screen edit.
 */
export function Header({
  title,
  subtitle,
  back = true,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  /** For a screen that is a mode of its parent rather than a route. */
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const drawer = useDrawer();

  return (
    <SafeAreaView edges={['top']} style={styles.headerSafe}>
      <View style={styles.header}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={onBack ?? (() => router.back())}
            android_ripple={{ color: colors.border, borderless: true }}
            style={styles.iconBtn}
          >
            <Icon name="arrow-back" tone="default" />
          </Pressable>
        ) : drawer ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('drawer.open')}
            onPress={drawer.open}
            android_ripple={{ color: colors.border, borderless: true }}
            style={styles.iconBtn}
          >
            <Icon name="menu" tone="default" />
          </Pressable>
        ) : (
          <View style={{ width: space.sm }} />
        )}
        <View style={{ flex: 1 }}>
          <Text variant={back ? 'heading' : 'title'} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="meta" tone="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      <StatusBanners />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerSafe: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    minHeight: touch.row,
  },
  iconBtn: {
    width: touch.min,
    height: touch.min,
    borderRadius: touch.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
