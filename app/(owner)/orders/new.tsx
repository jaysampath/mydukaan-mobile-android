import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { newId } from '../../../src/api/ids';
import { useCustomers, usePackedSkus } from '../../../src/data/queries';
import { useCreateOrder } from '../../../src/data/mutations';
import { mapRpcError } from '../../../src/data/errors';
import {
  ActionBar,
  Button,
  Card,
  Header,
  ListRow,
  Loading,
  Money,
  PackSize,
  SearchBar,
  Stepper,
  Text,
} from '../../../src/theme/components';
import { space } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

/**
 * Take an order.
 *
 * Two things worth knowing about this screen.
 *
 * 1. The order id is minted ONCE, when the screen mounts (`useRef`), not when
 *    Save is pressed. That is what makes a double-tap or a retry after a
 *    timeout safe: the server sees the same id and returns the existing order
 *    instead of creating a second one. Minting it in the submit handler would
 *    defeat the whole idempotency mechanism.
 *
 * 2. The running total shown while composing is an ESTIMATE, and is labelled as
 *    one. `create_order` prices each line from `packed_skus.sale_price` at
 *    commit time, so the authoritative total comes back in the response. They
 *    can differ if a price changed while the order was open, and presenting a
 *    local guess as the order value is how a customer gets quoted one number
 *    and billed another.
 */
export default function NewOrder() {
  const router = useRouter();
  const orderId = useRef(newId()).current;

  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const customers = useCustomers(search || null);
  const skus = usePackedSkus();
  const createOrder = useCreateOrder();

  const chosen = customers.data?.rows.find((c) => c.id === customerId);

  const items = useMemo(
    () =>
      Object.entries(qty)
        .filter(([, n]) => n > 0)
        .map(([packed_sku_id, qty_packets]) => ({ packed_sku_id, qty_packets })),
    [qty],
  );

  const estimate = useMemo(
    () =>
      items.reduce((sum, item) => {
        const sku = skus.data?.find((s) => s.id === item.packed_sku_id);
        return sum + (sku?.sale_price ?? 0) * item.qty_packets;
      }, 0),
    [items, skus.data],
  );

  const submit = async () => {
    setError(null);
    if (!customerId) return;
    if (items.length === 0) {
      setError(t('orders.noItems'));
      return;
    }
    try {
      const result = await createOrder.mutateAsync({ orderId, customerId, items });
      router.replace(`/(owner)/orders/${result.order_id}`);
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  // Step 1: who is it for.
  if (!customerId) {
    return (
      <>
        <Header title={t('orders.chooseCustomer')} />
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('common.search')} />
        {customers.isLoading ? (
          <Loading />
        ) : (
          <ScrollView>
            {customers.data?.rows.map((c) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={c.phone ?? undefined}
                onPress={() => setCustomerId(c.id)}
                right={
                  c.outstanding > 0 ? (
                    <>
                      <Money value={c.outstanding} tone="warning" />
                      <Text variant="meta" tone="muted">
                        {t('khata.outstanding')}
                      </Text>
                    </>
                  ) : undefined
                }
              />
            ))}
          </ScrollView>
        )}
      </>
    );
  }

  // Step 2: what they want.
  return (
    <>
      <Header title={t('orders.newTitle')} subtitle={chosen?.name} />
      {skus.isLoading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
          {skus.data?.map((s) => (
            <Card key={s.id}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{s.name}</Text>
                  <PackSize value={s.pack_size_base} />
                  <Money value={s.sale_price} variant="secondary" tone="muted" />
                </View>
                <Text variant="meta" tone={s.qty_packets > 0 ? 'muted' : 'danger'}>
                  {s.qty_packets} {t('stock.packed').toLowerCase()}
                </Text>
              </View>
              <Stepper
                value={qty[s.id] ?? 0}
                onChange={(n) => setQty((prev) => ({ ...prev, [s.id]: n }))}
              />
            </Card>
          ))}
          {error ? (
            <Text variant="secondary" tone="danger">
              {error}
            </Text>
          ) : null}
        </ScrollView>
      )}

      <ActionBar>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {/* Labelled an estimate on purpose -- see the header comment. */}
          <Text variant="secondary" tone="muted">
            {t('orders.estimatedTotal')}
          </Text>
          <Money value={estimate} variant="numeric" />
        </View>
        <Button
          label={t('orders.place')}
          onPress={submit}
          loading={createOrder.isPending}
          disabled={items.length === 0}
        />
      </ActionBar>
    </>
  );
}
