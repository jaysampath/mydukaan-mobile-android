import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useMe } from '../../src/auth/context';
import { useDaySummary } from '../../src/data/queries';
import {
  Header,
  Icon,
  IconBadge,
  ListRow,
  Loading,
  Money,
  Section,
  Stat,
  Text,
  type IconName,
} from '../../src/theme/components';
import { colors, elevation, radius, space, touch } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/** Orders-screen filters that a tile can open directly. See orders/index.tsx. */
type OrdersFilter = 'all' | 'to_pack' | 'to_dispatch' | 'out';

/**
 * Today.
 *
 * One RPC for the whole screen. Six separate calls to render one view would be
 * felt on a 2G connection in a market, which is the difference between an app
 * that opens and one people stop opening.
 *
 * Laid out as the owner's morning question, in order: how much cash came in,
 * who still owes, what is waiting on me, and the thing I most often do next.
 */
export default function Today() {
  const router = useRouter();
  const me = useMe();
  const { data, isLoading, isRefetching, refetch } = useDaySummary();

  const firstName = (me.context?.profile?.full_name ?? '').trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = t(
    `home.greeting.${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}`,
  );

  const openOrders = (filter: OrdersFilter) =>
    router.navigate({ pathname: '/(owner)/orders', params: { filter } });

  const outstanding = data?.outstanding_total ?? 0;

  return (
    <>
      <Header title={t('home.title')} subtitle={me.business?.name} back={false} />
      {isLoading && !data ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.lg }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <Text variant="heading">{firstName ? `${greeting}, ${firstName}` : greeting}</Text>

          {/* The hero: today's cash, with outstanding one tap from the khata. */}
          <View style={styles.hero}>
            <Text variant="secondary" style={{ color: colors.primarySoft }}>
              {t('home.cashCollected')}
            </Text>
            <Money value={data?.cash_collected ?? 0} variant="display" tone="onPrimary" />
            <View style={styles.heroRule} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate('/(owner)/khata')}
              style={styles.heroRow}
            >
              <Icon name="book-outline" size="sm" color={colors.primarySoft} />
              <Text variant="secondary" style={{ color: colors.primarySoft, flex: 1 }}>
                {t('home.outstanding')}
              </Text>
              <Money value={outstanding} variant="numericSmall" tone="onPrimary" />
              <Icon name="chevron-forward" size="sm" color={colors.primarySoft} />
            </Pressable>
          </View>

          <Section title={t('orders.title')} icon="receipt-outline" flush={false}>
            <View style={styles.grid}>
              <View style={styles.gridRow}>
                <Tile
                  label={t('home.ordersPlaced')}
                  value={data?.orders_placed}
                  icon="receipt-outline"
                  tone="info"
                  onPress={() => openOrders('all')}
                />
                <Tile
                  label={t('home.toPack')}
                  value={data?.orders_to_pack}
                  icon="cube-outline"
                  tone="primary"
                  onPress={() => openOrders('to_pack')}
                />
              </View>
              <View style={styles.gridRow}>
                <Tile
                  label={t('home.toDispatch')}
                  value={data?.orders_to_dispatch}
                  icon="send-outline"
                  tone="warning"
                  onPress={() => openOrders('to_dispatch')}
                />
                <Tile
                  label={t('home.out')}
                  value={data?.orders_out}
                  icon="bicycle-outline"
                  tone="warning"
                  onPress={() => openOrders('out')}
                />
              </View>
            </View>
          </Section>

          <QuickActions />

          {/* reorder_level_base has been in the schema since 0002 and read by
              nothing until the read layer landed. This is the first thing that
              actually surfaces it to the owner. */}
          {(data?.low_stock_count ?? 0) > 0 ? (
            <ListRow
              card
              leading={<IconBadge name="alert-circle-outline" tone="warning" />}
              title={
                <Text variant="bodyStrong" tone="warning">
                  {t('home.lowStock')}
                </Text>
              }
              subtitle={t('home.lowStockDetail', { count: data?.low_stock_count })}
              onPress={() => router.navigate('/(owner)/stock')}
            />
          ) : null}
        </ScrollView>
      )}
    </>
  );
}

/**
 * A tile inside the Orders section. The section card is already white, so the
 * tiles sit on the page tint to read as separate targets.
 */
function Tile({
  label,
  value,
  icon,
  tone,
  onPress,
}: {
  label: string;
  value: number | undefined;
  icon: IconName;
  tone: 'info' | 'primary' | 'warning';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
    >
      <IconBadge name={icon} tone={tone} size={36} />
      <Text variant="numeric">{value ?? 0}</Text>
      <Text variant="secondary" tone="muted">
        {label}
      </Text>
    </Pressable>
  );
}

/** The next thing an owner usually does, one tap from the home screen. */
function QuickActions() {
  const router = useRouter();
  const me = useMe();

  const actions: Array<{ key: string; label: string; icon: IconName; onPress: () => void }> = [];
  if (me.can('create_order')) {
    actions.push({
      key: 'order',
      label: t('home.newOrder'),
      icon: 'add-circle-outline',
      onPress: () => router.push('/(owner)/orders/new'),
    });
  }
  if (me.can('adjust_stock')) {
    actions.push({
      key: 'stock',
      label: t('home.enterStock'),
      icon: 'archive-outline',
      onPress: () => router.push('/(owner)/stock/adjust'),
    });
  }
  if (me.can('manage_masters')) {
    actions.push({
      key: 'customers',
      label: t('home.addCustomer'),
      icon: 'people-outline',
      onPress: () => router.push('/(owner)/catalog/customers'),
    });
  }
  // A lapsed plan hides every write, and an empty heading is worse than none.
  if (actions.length === 0) return null;

  return (
    <View style={{ gap: space.sm }}>
      <Text
        variant="secondary"
        tone="muted"
        style={{ fontWeight: '600', paddingHorizontal: space.xs }}
      >
        {t('home.quickActions')}
      </Text>
      <View style={styles.gridRow}>
        {actions.map((a) => (
          <Stat key={a.key} label={a.label} icon={a.icon} onPress={a.onPress}>
            {null}
          </Stat>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.xs,
    ...elevation.raised,
  },
  heroRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.primarySoft,
    opacity: 0.4,
    marginVertical: space.sm,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touch.min,
  },
  grid: { gap: space.md },
  gridRow: { flexDirection: 'row', gap: space.md },
  tile: {
    flex: 1,
    backgroundColor: colors.page,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
    minHeight: 112,
  },
});
