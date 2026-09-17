import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, View } from 'react-native';

import { useMe } from '../../src/auth/context';
import { useDaySummary } from '../../src/data/queries';
import {
  Button,
  Card,
  Header,
  Loading,
  Money,
  Stat,
  Text,
} from '../../src/theme/components';
import { space } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * Today.
 *
 * One RPC for the whole screen. Six separate calls to render one view would be
 * felt on a 2G connection in a market, which is the difference between an app
 * that opens and one people stop opening.
 */
export default function Today() {
  const router = useRouter();
  const me = useMe();
  const { data, isLoading, isRefetching, refetch } = useDaySummary();

  return (
    <>
      <Header title={t('home.title')} subtitle={me.business?.name} back={false} />
      {isLoading && !data ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Stat label={t('home.cashCollected')}>
              <Money value={data?.cash_collected ?? 0} variant="numeric" />
            </Stat>
            <Stat
              label={t('home.outstanding')}
              onPress={() => router.push('/(owner)/khata')}
            >
              <Money
                value={data?.outstanding_total ?? 0}
                variant="numeric"
                tone={(data?.outstanding_total ?? 0) > 0 ? 'warning' : 'default'}
              />
            </Stat>
          </View>

          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Stat label={t('home.ordersPlaced')}>
              <Text variant="numeric">{data?.orders_placed ?? 0}</Text>
            </Stat>
            <Stat
              label={t('home.toPack')}
              onPress={() => router.push('/(owner)/orders')}
            >
              <Text variant="numeric">{data?.orders_to_pack ?? 0}</Text>
            </Stat>
          </View>

          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Stat
              label={t('home.toDispatch')}
              onPress={() => router.push('/(owner)/orders')}
            >
              <Text variant="numeric">{data?.orders_to_dispatch ?? 0}</Text>
            </Stat>
            <Stat label={t('home.out')}>
              <Text variant="numeric">{data?.orders_out ?? 0}</Text>
            </Stat>
          </View>

          {/* reorder_level_base has been in the schema since 0002 and read by
              nothing until the read layer landed. This is the first thing that
              actually surfaces it to the owner. */}
          {(data?.low_stock_count ?? 0) > 0 ? (
            <Card>
              <Text variant="bodyStrong" tone="warning">
                {t('home.lowStock')}
              </Text>
              <Text variant="secondary" tone="muted">
                {data?.low_stock_count} item(s) at or below the level you set.
              </Text>
              <Button
                label={t('stock.title')}
                kind="secondary"
                onPress={() => router.push('/(owner)/stock')}
              />
            </Card>
          ) : null}

          {me.can('create_order') ? (
            <Button
              label={t('home.newOrder')}
              onPress={() => router.push('/(owner)/orders/new')}
            />
          ) : null}
        </ScrollView>
      )}
    </>
  );
}
