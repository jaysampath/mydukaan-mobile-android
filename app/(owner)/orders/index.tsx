import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { useMe } from '../../../src/auth/context';
import { useOrders } from '../../../src/data/queries';
import type { OrderStatus } from '../../../src/api/reads';
import {
  Avatar,
  EmptyState,
  FAB_CLEARANCE,
  Fab,
  Gap,
  Header,
  ListRow,
  Loading,
  Money,
  StatusPill,
  Text,
} from '../../../src/theme/components';
import { formatWhen } from '../../../src/format/date';
import { colors, radius, space } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

type Filter = 'all' | 'to_pack' | 'to_dispatch' | 'out' | 'unpaid';

/** One list serves every queue; the filter just changes the status set. */
const FILTERS: Record<Filter, OrderStatus[] | null> = {
  all: null,
  to_pack: ['PLACED'],
  to_dispatch: ['PACKED'],
  out: ['OUT_FOR_DELIVERY'],
  unpaid: ['DELIVERED', 'PAYMENT_PENDING'],
};

const isFilter = (v: unknown): v is Filter => typeof v === 'string' && v in FILTERS;

export default function Orders() {
  const router = useRouter();
  const me = useMe();
  // The Today tiles open this screen on a queue ("To pack" -> to_pack). The
  // tab stays mounted between visits, so follow the param when it changes,
  // not only on first render.
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<Filter>(isFilter(params.filter) ? params.filter : 'all');
  useEffect(() => {
    if (isFilter(params.filter)) setFilter(params.filter);
  }, [params.filter]);

  const { data, isLoading, isRefetching, refetch } = useOrders({ statuses: FILTERS[filter] });
  const rows = data?.rows ?? [];

  const chips: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: t('common.all') },
    { value: 'to_pack', label: t('home.toPack') },
    { value: 'to_dispatch', label: t('home.toDispatch') },
    { value: 'out', label: t('home.out') },
    { value: 'unpaid', label: t('orders.unpaid') },
  ];

  return (
    <>
      <Header title={t('orders.title')} back={false} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.chips}
      >
        {chips.map((c) => {
          const on = c.value === filter;
          return (
            <Pressable
              key={c.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(c.value)}
              // 40dp to look like a chip, +4dp slop each side to still be a
              // 48dp target.
              hitSlop={{ top: 4, bottom: 4 }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text
                variant="secondary"
                style={{ fontWeight: '600', color: on ? colors.onPrimary : colors.text }}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading && rows.length === 0 ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(o) => o.id}
          ItemSeparatorComponent={Gap}
          contentContainerStyle={{
            padding: space.lg,
            paddingTop: space.xs,
            paddingBottom: FAB_CLEARANCE,
            flexGrow: 1,
          }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={t('orders.empty')}
              detail={t('orders.emptyDetail')}
            />
          }
          renderItem={({ item }) => (
            <ListRow
              card
              leading={<Avatar name={item.customer_name} />}
              onPress={() => router.push(`/(owner)/orders/${item.id}`)}
              title={item.customer_name}
              subtitle={[
                item.order_no ? t('orders.orderNo', { no: item.order_no }) : '—',
                formatWhen(item.placed_at),
                t('orders.itemCount', { count: item.item_count }),
              ].join(' · ')}
              right={
                <>
                  <Money value={item.total_amount} />
                  {item.balance > 0 ? (
                    <Text variant="meta" tone="warning">
                      {t('orders.balance')}{' '}
                      <Money value={item.balance} variant="meta" tone="warning" />
                    </Text>
                  ) : null}
                  <StatusPill status={item.status} />
                </>
              }
            />
          )}
        />
      )}

      {me.can('create_order') ? (
        <Fab label={t('orders.newTitle')} onPress={() => router.push('/(owner)/orders/new')} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
