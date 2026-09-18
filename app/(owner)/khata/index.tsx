import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { useCustomerBalances } from '../../../src/data/queries';
import {
  Avatar,
  Card,
  EmptyState,
  Gap,
  Header,
  IconBadge,
  ListRow,
  Loading,
  Money,
  SearchBar,
  Text,
} from '../../../src/theme/components';
import { formatDate } from '../../../src/format/date';
import { space } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

/**
 * The khata: who owes what.
 *
 * This screen is the actual business. Cash arrives days after delivery and
 * often against no particular order, so outstanding is computed across ALL of
 * a customer's orders and payments -- Σ(orders) − Σ(payments) -- rather than
 * per order. An app that could only take payment from an order screen would not
 * match how these shops work.
 *
 * Defaults to only those who owe something, because that is the question the
 * owner actually has when they open it.
 */
export default function Khata() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const { data, isLoading, isRefetching, refetch } = useCustomerBalances(search || null, true);

  const rows = data?.rows ?? [];

  return (
    <>
      <Header title={t('khata.title')} back={false} />

      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <IconBadge
            name="wallet-outline"
            tone={(data?.outstanding_total ?? 0) > 0 ? 'warning' : 'success'}
          />
          <View style={{ flex: 1 }}>
            <Text variant="secondary" tone="muted">
              {t('khata.totalOutstanding')}
            </Text>
            <Money
              value={data?.outstanding_total ?? 0}
              variant="numeric"
              tone={(data?.outstanding_total ?? 0) > 0 ? 'warning' : 'success'}
            />
          </View>
        </Card>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder={t('common.search')} />

      {isLoading && rows.length === 0 ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.customer_id}
          ItemSeparatorComponent={Gap}
          contentContainerStyle={{ padding: space.lg, paddingTop: space.xs, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-done-outline"
              title={t('khata.empty')}
              detail={t('khata.emptyDetail')}
            />
          }
          renderItem={({ item }) => (
            <ListRow
              card
              leading={<Avatar name={item.name} />}
              onPress={() => router.push(`/(owner)/khata/${item.customer_id}`)}
              title={item.name}
              subtitle={
                item.last_payment_on
                  ? `${t('khata.lastPaid')} ${formatDate(item.last_payment_on)}`
                  : (item.phone ?? undefined)
              }
              right={<Money value={item.outstanding} tone="warning" />}
            />
          )}
        />
      )}
    </>
  );
}
