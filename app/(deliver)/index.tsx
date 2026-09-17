import { useRouter } from 'expo-router';
import { FlatList, RefreshControl } from 'react-native';

import { useSession } from '../../src/auth/session';
import { useOrders } from '../../src/data/queries';
import {
  Button,
  Divider,
  EmptyState,
  Header,
  ListRow,
  Loading,
  Money,
  StatusPill,
  Text,
} from '../../src/theme/components';
import { t } from '../../src/i18n';

/**
 * Today's run.
 *
 * Shows what is out for delivery and what has been delivered but not yet paid,
 * because both are still this person's problem: the second group is where the
 * cash is.
 */
export default function Deliveries() {
  const router = useRouter();
  const { signOut } = useSession();
  const { data, isLoading, isRefetching, refetch } = useOrders({
    statuses: ['OUT_FOR_DELIVERY', 'DELIVERED', 'PAYMENT_PENDING'],
  });

  const rows = data?.rows ?? [];

  return (
    <>
      <Header
        title={t('deliver.title')}
        back={false}
        right={
          <Button label={t('common.signOut')} kind="ghost" block={false} onPress={signOut} />
        }
      />
      {isLoading && rows.length === 0 ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(o) => o.id}
          ItemSeparatorComponent={Divider}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <EmptyState title={t('deliver.empty')} detail={t('deliver.emptyDetail')} />
          }
          renderItem={({ item }) => (
            <ListRow
              tall
              onPress={() => router.push(`/(deliver)/${item.id}`)}
              title={<Text variant="title">{item.customer_name}</Text>}
              subtitle={item.customer_phone ?? undefined}
              right={
                <>
                  <Money value={item.balance > 0 ? item.balance : item.total_amount} />
                  {item.balance > 0 ? (
                    <Text variant="meta" tone="warning">
                      {t('deliver.collect')}
                    </Text>
                  ) : null}
                  <StatusPill status={item.status} />
                </>
              }
            />
          )}
        />
      )}
    </>
  );
}
