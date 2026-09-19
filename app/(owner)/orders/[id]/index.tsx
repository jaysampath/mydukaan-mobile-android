import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { useMe } from '../../../../src/auth/context';
import { useOrder } from '../../../../src/data/queries';
import { useSetOrderStatus } from '../../../../src/data/mutations';
import { mapRpcError } from '../../../../src/data/errors';
import {
  ActionBar,
  Button,
  Card,
  Divider,
  Header,
  Loading,
  Money,
  PackSize,
  Packets,
  StatusPill,
  Text,
} from '../../../../src/theme/components';
import { formatWhen } from '../../../../src/format/date';
import { space } from '../../../../src/theme/tokens';
import { t } from '../../../../src/i18n';

/**
 * One order.
 *
 * The action buttons are driven by `allowed_transitions` from the server, NOT
 * by inspecting `status` here. The lifecycle rule already lives in three places
 * in SQL; a fourth copy in TypeScript would be the one that disagrees. It also
 * means this screen cannot offer `cancel` on a dispatched order -- the server
 * withholds that action because no reversal RPC exists yet and cancelling would
 * leave the SALE_OUT ledger rows standing.
 */
export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const { data, isLoading, error } = useOrder(id);
  const setStatus = useSetOrderStatus();

  if (isLoading) return <Loading />;
  if (error || !data) {
    return (
      <>
        <Header title={t('orders.title')} />
        <View style={{ padding: space.xl }}>
          <Text variant="body" tone="danger">
            {mapRpcError(error).message}
          </Text>
        </View>
      </>
    );
  }

  const { order, customer, items, allowed_transitions: next } = data;
  const offer = (action: string) => next.includes(action as never);

  return (
    <>
      <Header
        title={order.order_no ? t('orders.orderNo', { no: order.order_no }) : t('orders.title')}
        subtitle={customer.name}
        right={<StatusPill status={order.status} />}
      />

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card>
          <Text variant="bodyStrong">{customer.name}</Text>
          {customer.phone ? (
            <Text variant="secondary" tone="muted">
              {customer.phone}
            </Text>
          ) : null}
          {customer.address ? (
            <Text variant="secondary" tone="muted">
              {customer.address}
            </Text>
          ) : null}
          <Text variant="meta" tone="muted">
            {formatWhen(order.placed_at)}
          </Text>
        </Card>

        <Card>
          <Text variant="bodyStrong">{t('orders.items')}</Text>
          {items.map((item) => (
            <View key={item.id} style={{ gap: 2, paddingVertical: space.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="body">{item.name}</Text>
                <Money value={item.line_total} />
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <PackSize value={item.pack_size_base} />
                <Text variant="meta" tone="muted">
                  × {item.qty_packets}
                </Text>
              </View>
            </View>
          ))}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyStrong">{t('orders.total')}</Text>
            <Money value={order.total_amount} variant="numeric" />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="secondary" tone="muted">
              {t('orders.paid')}
            </Text>
            <Money value={data.paid} variant="numericSmall" tone="success" />
          </View>
          {/* Paid includes the customer's account credit applied to this
              order (oldest orders first), so the payments listed for the order
              alone would not add up to it without this line. */}
          {data.paid_from_account > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="meta" tone="muted">
                {t('orders.fromAccount')}
              </Text>
              <Money value={data.paid_from_account} variant="meta" tone="muted" />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="secondary" tone="muted">
              {t('orders.balance')}
            </Text>
            <Money
              value={data.balance}
              variant="numericSmall"
              tone={data.balance > 0 ? 'warning' : 'success'}
            />
          </View>
        </Card>

        {order.order_no ? (
          <Button
            label={t('orders.receipt')}
            kind="secondary"
            onPress={() => router.push(`/(owner)/orders/${id}/receipt`)}
          />
        ) : null}
      </ScrollView>

      <ActionBar>
        {offer('mark_packed') && me.can('mark_packed') ? (
          <Button
            label={t('orders.markPacked')}
            onPress={() => setStatus.mutate({ orderId: id, status: 'PACKED' })}
            loading={setStatus.isPending}
          />
        ) : null}

        {/* Dispatch is a whole screen, never an inline button: it is where
            stock actually leaves and it cannot be undone. */}
        {offer('dispatch') && me.can('dispatch_order') ? (
          <Button
            label={t('orders.dispatch')}
            kind="dispatch"
            onPress={() => router.push(`/(owner)/orders/${id}/dispatch`)}
          />
        ) : null}

        {offer('mark_delivered') && me.can('mark_delivered') ? (
          <Button
            label={t('orders.markDelivered')}
            onPress={() => setStatus.mutate({ orderId: id, status: 'DELIVERED' })}
            loading={setStatus.isPending}
          />
        ) : null}

        {offer('record_payment') && me.can('record_payment') ? (
          <Button
            label={t('orders.recordPayment')}
            kind={offer('mark_delivered') ? 'secondary' : 'primary'}
            onPress={() => router.push(`/(owner)/orders/${id}/payment`)}
          />
        ) : null}
      </ActionBar>
    </>
  );
}
