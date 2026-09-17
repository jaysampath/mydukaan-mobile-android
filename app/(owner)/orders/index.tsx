import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { useMe } from '../../../src/auth/context';
import { useOrders } from '../../../src/data/queries';
import type { OrderStatus } from '../../../src/api/reads';
import {
  ActionBar,
  Button,
  Choice,
  Divider,
  EmptyState,
  Header,
  ListRow,
  Loading,
  Money,
  StatusPill,
  Text,
} from '../../../src/theme/components';
import { formatWhen } from '../../../src/format/date';
import { space } from '../../../src/theme/tokens';
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

export default function Orders() {
  const router = useRouter();
  const me = useMe();
  const [filter, setFilter] = useState<Filter>('all');
  const { data, isLoading, isRefetching, refetch } = useOrders({ statuses: FILTERS[filter] });

  const rows = data?.rows ?? [];

  return (
    <>
      <Header title={t('orders.title')} back={false} />
      <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <Choice
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'to_pack', label: t('home.toPack') },
            { value: 'to_dispatch', label: t('home.toDispatch') },
            { value: 'out', label: t('home.out') },
            { value: 'unpaid', label: t('orders.balance') },
          ]}
        />
      </View>

      {isLoading && rows.length === 0 ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(o) => o.id}
          ItemSeparatorComponent={Divider}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <EmptyState title={t('orders.empty')} detail={t('orders.emptyDetail')} />
          }
          renderItem={({ item }) => (
            <ListRow
              onPress={() => router.push(`/(owner)/orders/${item.id}`)}
              title={item.customer_name}
              subtitle={`${
                item.order_no ? t('orders.orderNo', { no: item.order_no }) : '—'
              } · ${formatWhen(item.placed_at)} · ${item.item_count} item(s)`}
              right={
                <>
                  <Money value={item.total_amount} />
                  {item.balance > 0 ? (
                    <Text variant="meta" tone="warning">
                      {t('orders.balance')}
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
        <ActionBar>
          <Button label={t('orders.newTitle')} onPress={() => router.push('/(owner)/orders/new')} />
        </ActionBar>
      ) : null}
    </>
  );
}
