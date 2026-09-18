import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { useMe } from '../../../src/auth/context';
import { useStock } from '../../../src/data/queries';
import {
  Button,
  Divider,
  EmptyState,
  FAB_CLEARANCE,
  Fab,
  Header,
  IconBadge,
  ListRow,
  Loading,
  Money,
  PackSize,
  Qty,
  Section,
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
          icon="cube-outline"
          title={t('stock.empty')}
          detail={t('stock.emptyDetail')}
          action={
            me.can('manage_masters') ? (
              <Button
                label={t('catalog.newMaterial')}
                icon="add"
                onPress={() => router.push('/(owner)/catalog/material')}
              />
            ) : undefined
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: FAB_CLEARANCE }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          {raw.length > 0 ? (
            <Section title={t('stock.bulk')} icon="leaf-outline">
              {raw.map((m, i) => (
                <Fragment key={m.raw_material_id}>
                  {i > 0 ? <Divider inset /> : null}
                  <ListRow
                    leading={
                      <IconBadge
                        name={m.below_reorder ? 'alert-circle-outline' : 'leaf-outline'}
                        tone={m.below_reorder ? 'warning' : 'primary'}
                      />
                    }
                    title={m.name}
                    subtitle={
                      m.below_reorder ? (
                        <Text variant="secondary" tone="warning">
                          {t('stock.belowReorder')}
                        </Text>
                      ) : undefined
                    }
                    right={
                      <Qty
                        value={m.qty_base}
                        kind="RAW"
                        baseUnit={m.base_unit}
                        tone={m.below_reorder ? 'warning' : 'default'}
                      />
                    }
                  />
                </Fragment>
              ))}
            </Section>
          ) : null}

          {packed.length > 0 ? (
            <Section title={t('stock.packed')} icon="cube-outline">
              {packed.map((s, i) => (
                <Fragment key={s.packed_sku_id}>
                  {i > 0 ? <Divider inset /> : null}
                  <ListRow
                    leading={<IconBadge name="cube-outline" tone="info" />}
                    title={s.name}
                    subtitle={
                      <View style={{ flexDirection: 'row', gap: space.sm }}>
                        <PackSize value={s.pack_size_base} />
                        <Money value={s.sale_price} variant="secondary" tone="muted" />
                      </View>
                    }
                    right={<Qty value={s.qty_packets} kind="PACKED" />}
                  />
                </Fragment>
              ))}
            </Section>
          ) : null}
        </ScrollView>
      )}

      {me.can('adjust_stock') && !empty ? (
        <Fab
          label={t('home.enterStock')}
          icon="archive-outline"
          onPress={() => router.push('/(owner)/stock/adjust')}
        />
      ) : null}
    </>
  );
}
