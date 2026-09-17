import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { newId } from '../../src/api/ids';
import { useOrder } from '../../src/data/queries';
import { useRecordPayment, useSetOrderStatus } from '../../src/data/mutations';
import { mapRpcError } from '../../src/data/errors';
import {
  ActionBar,
  Button,
  Card,
  Divider,
  Header,
  Loading,
  Money,
  NumberField,
  PackSize,
  StatusPill,
  Text,
} from '../../src/theme/components';
import { space } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * One delivery.
 *
 * The user of this screen is standing outside a shop, so the things they need
 * are large and near the top: who, where, what phone number, how much to
 * collect. The address is tappable-to-call because that is what actually
 * happens when a shop is shut.
 *
 * Both actions are driven by `allowed_transitions`, so this screen cannot offer
 * something the server will refuse.
 */
export default function Delivery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const paymentId = useRef(newId()).current;

  const { data, isLoading } = useOrder(id);
  const setStatus = useSetOrderStatus();
  const record = useRecordPayment();

  const [collecting, setCollecting] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Loading />;

  const offer = (action: string) => data.allowed_transitions.includes(action as never);
  const value = amount === '' ? String(data.balance) : amount;
  const parsed = Number(value);

  const collect = async () => {
    setError(null);
    try {
      await record.mutateAsync({
        paymentId,
        customerId: data.customer.id,
        amount: parsed,
        orderId: id,
      });
      setCollecting(false);
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  return (
    <>
      <Header title={data.customer.name} right={<StatusPill status={data.order.status} />} />

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card>
          <Text variant="title">{data.customer.name}</Text>
          {data.customer.address ? (
            <Text variant="body" tone="muted">
              {data.customer.address}
            </Text>
          ) : null}
          {data.customer.phone ? (
            <Button
              label={`${t('deliver.call')} ${data.customer.phone}`}
              kind="secondary"
              onPress={() => Linking.openURL(`tel:${data.customer.phone}`)}
            />
          ) : null}
        </Card>

        <Card>
          {data.items.map((item) => (
            <View key={item.id} style={{ paddingVertical: space.xs }}>
              <Text variant="body">
                {item.name} × {item.qty_packets}
              </Text>
              <PackSize value={item.pack_size_base} />
            </View>
          ))}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyStrong">{t('orders.total')}</Text>
            <Money value={data.order.total_amount} variant="numeric" />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyStrong" tone="warning">
              {t('deliver.collect')}
            </Text>
            <Money value={data.balance} variant="numeric" tone="warning" />
          </View>
          {/* What they owe overall, not just on this order -- a delivery person
              collecting cash needs the running khata, not one invoice. */}
          <Text variant="meta" tone="muted">
            {t('khata.outstanding')} (all orders)
          </Text>
          <Money value={data.customer_outstanding} variant="numericSmall" tone="muted" />
        </Card>

        {collecting ? (
          <Card>
            <NumberField
              label={t('khata.amount')}
              value={value}
              onChangeText={setAmount}
              autoFocus
              selectTextOnFocus
            />
            {error ? (
              <Text variant="secondary" tone="danger">
                {error}
              </Text>
            ) : null}
            <Button
              label={t('khata.record')}
              onPress={collect}
              loading={record.isPending}
              disabled={!(Number.isFinite(parsed) && parsed > 0)}
            />
            <Button label={t('common.cancel')} kind="ghost" onPress={() => setCollecting(false)} />
          </Card>
        ) : null}

        {error && !collecting ? (
          <Text variant="secondary" tone="danger">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <ActionBar>
        {offer('mark_delivered') ? (
          <Button
            label={t('orders.markDelivered')}
            onPress={() => setStatus.mutate({ orderId: id, status: 'DELIVERED' })}
            loading={setStatus.isPending}
          />
        ) : null}
        {offer('record_payment') && !collecting ? (
          <Button
            label={t('deliver.collect')}
            kind={offer('mark_delivered') ? 'secondary' : 'primary'}
            onPress={() => setCollecting(true)}
          />
        ) : null}
        <Button label={t('common.back')} kind="ghost" onPress={() => router.back()} />
      </ActionBar>
    </>
  );
}
