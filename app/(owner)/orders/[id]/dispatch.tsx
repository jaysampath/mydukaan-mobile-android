import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useOrder } from '../../../../src/data/queries';
import { useDispatchOrder } from '../../../../src/data/mutations';
import { mapRpcError } from '../../../../src/data/errors';
import {
  ActionBar,
  ArmedButton,
  Button,
  Card,
  Header,
  Loading,
  PackSize,
  Text,
} from '../../../../src/theme/components';
import { colors, space } from '../../../../src/theme/tokens';
import { t } from '../../../../src/i18n';

/**
 * Dispatch.
 *
 * This is the one screen in the app for an action that cannot be taken back.
 * `dispatch_order` writes the SALE_OUT ledger rows -- stock physically leaves
 * the shelf as far as the books are concerned -- and there is no reversal RPC,
 * so cancelling afterwards would flip a status while the stock stayed gone.
 *
 * Everything here follows from that:
 *
 *   * A full screen, not a dialog and not a row button. Reached by an explicit
 *     action on the order, so the user has already decided once.
 *   * Its own colour (`colors.dispatch`), deliberately not `danger` -- red
 *     means "something went wrong" everywhere else and dispatching is not an
 *     error -- and not `primary`, which is every ordinary confirm.
 *   * It lists exactly what leaves, with what is on the shelf beside it, so a
 *     shortage is visible before the tap rather than as a server error after.
 *   * The confirm is disabled for ~700ms after render (ArmedButton), because on
 *     a slow phone this screen can arrive under a finger already moving.
 *   * `already_dispatched: true` renders as SUCCESS, not an error. That is the
 *     idempotent retry path working exactly as intended.
 */
export default function Dispatch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useOrder(id);
  const dispatch = useDispatchOrder();
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Loading />;

  const short = data.items.filter((i) => i.qty_on_hand < i.qty_packets);

  const go = async () => {
    setError(null);
    try {
      const result = await dispatch.mutateAsync(id);
      // Not an error. The order was already out; the retry simply confirmed it.
      router.replace(`/(owner)/orders/${id}`);
      if (result.already_dispatched) {
        // Nothing to warn about -- the detail screen shows the status.
      }
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  return (
    <>
      <Header title={t('orders.dispatchTitle')} subtitle={data.customer.name} />

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card style={{ borderColor: colors.dispatch, borderWidth: 2 }}>
          <Text variant="bodyStrong" tone="warning">
            {t('orders.dispatchWarning')}
          </Text>
        </Card>

        <Card>
          {data.items.map((item) => {
            const enough = item.qty_on_hand >= item.qty_packets;
            return (
              <View key={item.id} style={{ paddingVertical: space.sm, gap: 2 }}>
                <Text variant="bodyStrong">{item.name}</Text>
                <PackSize value={item.pack_size_base} />
                <View style={{ flexDirection: 'row', gap: space.lg }}>
                  <Text variant="numericSmall">
                    {t('orders.needed')}: {item.qty_packets}
                  </Text>
                  <Text variant="numericSmall" tone={enough ? 'muted' : 'danger'}>
                    {t('orders.onHand')}: {item.qty_on_hand}
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>

        {short.length > 0 ? (
          <Text variant="secondary" tone="danger">
            There is not enough stock for {short.map((s) => s.name).join(', ')}. Enter or correct
            your stock first.
          </Text>
        ) : null}

        {error ? (
          <Text variant="secondary" tone="danger">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <ActionBar>
        <ArmedButton
          label={t('orders.dispatchConfirm')}
          armingLabel={t('orders.dispatchArming')}
          onPress={go}
          loading={dispatch.isPending}
          disabled={short.length > 0}
        />
        <Button label={t('common.cancel')} kind="ghost" onPress={() => router.back()} />
      </ActionBar>
    </>
  );
}
