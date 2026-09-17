import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, View } from 'react-native';

import { useMe } from '../../../src/auth/context';
import { useStock } from '../../../src/data/queries';
import {
  ActionBar,
  Button,
  Card,
  Divider,
  EmptyState,
  Header,
  Loading,
  Money,
  PackSize,
  Qty,
  Text,
} from '../../../src/theme/components';
import { space } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

/**
 * What is on the shelf.
 *
 * Both halves come from the ledger by SUM() on every call, so there is no
 * cached quantity anywhere that can drift from the movements behind it. Bulk
 * and packets are shown separately and never added together -- they are
 * different entities joined by a conversion, not two views of one number.
 */
export default function Stock() {
  const router = useRouter();
  const me = useMe();
  const { data, isLoading, isRefetching, refetch } = useStock();

  const raw = data?.raw ?? [];
  const packed = data?.packed ?? [];
  const empty = raw.length === 0 && packed.length === 0;

  return (
    <>
      <Header title={t('stock.title')} back={false} />

      {isLoading && !data ? (
        <Loading />
      ) : empty ? (
        <EmptyState
          title={t('stock.empty')}
          detail={t('stock.emptyDetail')}
          action={
            me.can('manage_masters') ? (
              <Button
                label={t('catalog.newMaterial')}
                onPress={() => router.push('/(owner)/catalog/material')}
              />
            ) : undefined
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <Card>
            <Text variant="bodyStrong">{t('stock.bulk')}</Text>
            {raw.map((m) => (
              <View key={m.raw_material_id}>
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
                    <Text variant="body">{m.name}</Text>
                    {m.below_reorder ? (
                      <Text variant="meta" tone="warning">
                        {t('stock.belowReorder')}
                      </Text>
                    ) : null}
                  </View>
                  <Qty
                    value={m.qty_base}
                    kind="RAW"
                    baseUnit={m.base_unit}
                    tone={m.below_reorder ? 'warning' : 'default'}
                  />
                </View>
              </View>
            ))}
          </Card>

          <Card>
            <Text variant="bodyStrong">{t('stock.packed')}</Text>
            {packed.map((s) => (
              <View key={s.packed_sku_id}>
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
                    <Text variant="body">{s.name}</Text>
                    <View style={{ flexDirection: 'row', gap: space.sm }}>
                      <PackSize value={s.pack_size_base} />
                      <Money value={s.sale_price} variant="meta" tone="muted" />
                    </View>
                  </View>
                  <Qty value={s.qty_packets} kind="PACKED" />
                </View>
              </View>
            ))}
          </Card>
        </ScrollView>
      )}

      {me.can('adjust_stock') ? (
        <ActionBar>
          <Button label={t('stock.adjust')} onPress={() => router.push('/(owner)/stock/adjust')} />
        </ActionBar>
      ) : null}
    </>
  );
}
