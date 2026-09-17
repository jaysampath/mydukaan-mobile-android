import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { newId } from '../../../../src/api/ids';
import { useOrder } from '../../../../src/data/queries';
import { useRecordPayment } from '../../../../src/data/mutations';
import { mapRpcError } from '../../../../src/data/errors';
import {
  ActionBar,
  Button,
  Card,
  Header,
  Loading,
  Money,
  NumberField,
  Text,
} from '../../../../src/theme/components';
import { space } from '../../../../src/theme/tokens';
import { t } from '../../../../src/i18n';

/**
 * Record cash against an order.
 *
 * Partial payment is the norm in this business, not the exception, so the
 * amount is free-form and pre-filled with the balance rather than being an
 * all-or-nothing "mark paid" button. `record_payment` closes the order by
 * itself once the balance reaches zero.
 *
 * The payment id is minted once on mount. If this request times out and the
 * user presses Record again, the server sees the same id and the cash is
 * counted once -- which is the entire reason the caller supplies the uuid.
 *
 * On failure the form keeps its contents. A payment is never queued to fire
 * later (see the networkMode note in src/data/mutations.ts): the user finds out
 * now and decides for themselves whether to try again.
 */
export default function RecordPayment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const paymentId = useRef(newId()).current;

  const { data, isLoading } = useOrder(id);
  const record = useRecordPayment();
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Loading />;

  // Pre-fill with what is owed; the user can reduce it.
  const value = amount === '' ? String(data.balance) : amount;
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed > 0;

  const submit = async () => {
    setError(null);
    try {
      await record.mutateAsync({
        paymentId,
        customerId: data.customer.id,
        amount: parsed,
        orderId: id,
        note: note.trim() || undefined,
      });
      router.replace(`/(owner)/orders/${id}`);
    } catch (e) {
      // Form contents are deliberately left alone so the amount is not retyped.
      setError(mapRpcError(e).message);
    }
  };

  return (
    <>
      <Header title={t('khata.payTitle')} subtitle={data.customer.name} />

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="secondary" tone="muted">
              {t('orders.total')}
            </Text>
            <Money value={data.order.total_amount} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="secondary" tone="muted">
              {t('orders.paid')}
            </Text>
            <Money value={data.paid} tone="success" />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyStrong">{t('orders.balance')}</Text>
            <Money value={data.balance} variant="numeric" tone="warning" />
          </View>
        </Card>

        <NumberField
          label={t('khata.amount')}
          value={value}
          onChangeText={setAmount}
          selectTextOnFocus
        />
        <Text variant="meta" tone="muted">
          {t('khata.outstanding')}: {' '}
        </Text>
        <Money value={data.customer_outstanding} variant="numericSmall" tone="muted" />

        {error ? (
          <Text variant="secondary" tone="danger">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <ActionBar>
        <Button
          label={t('khata.record')}
          onPress={submit}
          loading={record.isPending}
          disabled={!valid}
        />
      </ActionBar>
    </>
  );
}
