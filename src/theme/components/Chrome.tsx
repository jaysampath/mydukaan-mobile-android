import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useMe } from '../../auth/context';
import { useIsOnline } from '../../data/online';
import { Banner } from './Layout';
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
 * A screen header with a back affordance.
 *
 * Hand-rolled rather than using the Stack header so the back target is always
 * large enough (48dp) and the title can use our own type scale.
 */
export function Header({
  title,
  subtitle,
  back = true,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <SafeAreaView edges={['top']} style={styles.headerSafe}>
      <View style={styles.header}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Text variant="title" tone="primary">
              ‹
            </Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text variant="heading">{title}</Text>
          {subtitle ? (
            <Text variant="meta" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerSafe: { backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: touch.row,
  },
  backBtn: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
