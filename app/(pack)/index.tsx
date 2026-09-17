import { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';

import { useSession } from '../../src/auth/session';
import { useOrder, useOrders } from '../../src/data/queries';
import { useSetOrderStatus } from '../../src/data/mutations';
import { mapRpcError } from '../../src/data/errors';
import {
  ActionBar,
  Button,
  Card,
  Divider,
  EmptyState,
  Header,
  ListRow,
  Loading,
  Packets,
  PackSize,
  Text,
} from '../../src/theme/components';
import { formatWhen } from '../../src/format/date';
import { space } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * What needs packing.
 *
 * Deliberately spare. Rows are 88dp so they can be hit with one thumb and
 * floury hands; there is no search, no prices, no customer balance and no
 * navigation depth. A packer opens this, sees a queue, opens one, packs it,
 * taps one big button.
 *
 * Prices are absent on purpose, not by oversight -- a packer has no need for
 * them, and the read RPCs enforce the same boundary server-side.
 */
export default function ToPack() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { signOut } = useSession();
  const queue = useOrders({ statuses: ['PLACED'] });
  const detail = useOrder(openId ?? undefined);
  const setStatus = useSetOrderStatus();
  const [error, setError] = useState<string | null>(null);

  // The pick list for one order.
  if (openId) {
    if (detail.isLoading || !detail.data) return <Loading />;
    const d = detail.data;

    const markPacked = async () => {
      setError(null);
      try {
        await setStatus.mutateAsync({ orderId: openId, status: 'PACKED' });
        setOpenId(null);
      } catch (e) {
        setError(mapRpcError(e).message);
      }
    };

    return (
      <>
        <Header
          title={d.customer.name}
          subtitle={d.order.order_no ? t('orders.orderNo', { no: d.order.order_no }) : undefined}
        />
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
          {d.items.map((item) => (
            <Card key={item.id}>
              <Text variant="title">{item.name}</Text>
              <PackSize value={item.pack_size_base} variant="body" />
              <Packets value={item.qty_packets} />
            </Card>
          ))}
          {error ? (
            <Text variant="secondary" tone="danger">
              {error}
            </Text>
          ) : null}
        </ScrollView>
        <ActionBar>
          <Button
            label={t('orders.markPacked')}
            onPress={markPacked}
            loading={setStatus.isPending}
          />
          <Button label={t('common.back')} kind="ghost" onPress={() => setOpenId(null)} />
        </ActionBar>
      </>
    );
  }

  const rows = queue.data?.rows ?? [];

  return (
    <>
      <Header
        title={t('packer.title')}
        back={false}
        right={
          <Button label={t('common.signOut')} kind="ghost" block={false} onPress={signOut} />
        }
      />
      {queue.isLoading && rows.length === 0 ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(o) => o.id}
          ItemSeparatorComponent={Divider}
          refreshControl={
            <RefreshControl refreshing={queue.isRefetching} onRefresh={queue.refetch} />
          }
          ListEmptyComponent={
            <EmptyState title={t('packer.empty')} detail={t('packer.emptyDetail')} />
          }
          renderItem={({ item }) => (
            <ListRow
              tall
              onPress={() => setOpenId(item.id)}
              title={<Text variant="title">{item.customer_name}</Text>}
              subtitle={`${item.item_count} item(s) · ${formatWhen(item.placed_at)}`}
            />
          )}
        />
      )}
    </>
  );
}
