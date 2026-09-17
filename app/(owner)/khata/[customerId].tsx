import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { newId } from '../../../src/api/ids';
import { useMe } from '../../../src/auth/context';
import { useCustomerLedger } from '../../../src/data/queries';
import { useRecordPayment } from '../../../src/data/mutations';
import { mapRpcError } from '../../../src/data/errors';
import {
  ActionBar,
  Button,
  Card,
  Divider,
  Header,
  Loading,
  Money,
  NumberField,
  StatusPill,
  Text,
} from '../../../src/theme/components';
import { formatDate } from '../../../src/format/date';
import { formatMoney } from '../../../src/format/money';
import { space } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

/**
 * One customer's running account.
 *
 * Payment here is recorded against the ACCOUNT, not an order
 * (`p_order_id: null`), which is how cash actually arrives: a customer settles
 * some of what they owe, days later, without reference to which delivery it was
 * for. `record_payment` still closes individual orders as the balance allows.
 *
 * The reminder button deep-links to a WhatsApp chat. A text message CAN be
 * pre-filled into a specific chat from Expo; a FILE cannot, which is why
 * receipts go through the share sheet instead. Worth keeping that distinction
 * straight -- it is the difference between a feature that works and a promise
 * the platform will not keep.
 */
export default function CustomerLedger() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const router = useRouter();
  const me = useMe();
  const paymentId = useRef(newId()).current;

  const { data, isLoading } = useCustomerLedger(customerId);
  const record = useRecordPayment();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  if (isLoading || !data) return <Loading />;

  const balance = data.balance;
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0;

  const submit = async () => {
    setError(null);
    try {
      await record.mutateAsync({
        paymentId,
        customerId,
        amount: parsed,
        // Deliberately not tied to an order: this is money against the khata.
        note: 'Account payment',
      });
      setPaying(false);
      setAmount('');
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  const remind = () => {
    const owed = formatMoney(balance?.outstanding ?? 0);
    const msg = `Namaste ${balance?.name ?? ''}, ${owed} is outstanding on your account. Thank you.`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() => {
      // WhatsApp not installed; nothing useful to do but not worth an error.
    });
  };

  return (
    <>
      <Header title={balance?.name ?? t('khata.title')} />

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="secondary" tone="muted">
              {t('khata.billed')}
            </Text>
            <Money value={balance?.total_billed ?? 0} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="secondary" tone="muted">
              {t('khata.settled')}
            </Text>
            <Money value={balance?.total_paid ?? 0} tone="success" />
          </View>
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyStrong">{t('khata.outstanding')}</Text>
            <Money
              value={balance?.outstanding ?? 0}
              variant="numeric"
              tone={(balance?.outstanding ?? 0) > 0 ? 'warning' : 'success'}
            />
          </View>
        </Card>

        {paying ? (
          <Card>
            <NumberField
              label={t('khata.amount')}
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
            <Text variant="meta" tone="muted">
              {t('khata.againstAccount')}
            </Text>
            {error ? (
              <Text variant="secondary" tone="danger">
                {error}
              </Text>
            ) : null}
            <Button
              label={t('khata.record')}
              onPress={submit}
              loading={record.isPending}
              disabled={!valid}
            />
            <Button label={t('common.cancel')} kind="ghost" onPress={() => setPaying(false)} />
          </Card>
        ) : null}

        <Card>
          <Text variant="bodyStrong">{t('orders.title')}</Text>
          {data.orders.rows.map((o) => (
            <View key={o.id}>
              <Divider />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: space.sm,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="body">
                    {o.order_no ? t('orders.orderNo', { no: o.order_no }) : '—'}
                  </Text>
                  <Text variant="meta" tone="muted">
                    {formatDate(o.placed_at)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Money value={o.total_amount} />
                  <StatusPill status={o.status} />
                </View>
              </View>
            </View>
          ))}
        </Card>

        <Card>
          <Text variant="bodyStrong">{t('khata.payTitle')}</Text>
          {data.payments.rows.map((p) => (
            <View key={p.id}>
              <Divider />
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: space.sm,
                }}
              >
                <Text variant="secondary" tone="muted">
                  {formatDate(p.paid_on)}
                </Text>
                {/* Signed: a negative amount is a refund or a reversal. */}
                <Money value={p.amount} tone={p.amount < 0 ? 'danger' : 'success'} />
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>

      <ActionBar>
        {me.can('record_payment') && !paying ? (
          <Button label={t('khata.payTitle')} onPress={() => setPaying(true)} />
        ) : null}
        {(balance?.outstanding ?? 0) > 0 ? (
          <Button label="Send a reminder" kind="secondary" onPress={remind} />
        ) : null}
      </ActionBar>
    </>
  );
}
