import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';

import { useMe } from '../../../src/auth/context';
import { useSession } from '../../../src/auth/session';
import {
  Button,
  Card,
  Divider,
  Header,
  ListRow,
  Text,
} from '../../../src/theme/components';
import { space } from '../../../src/theme/tokens';
import { isDev } from '../../../src/env';
import { t } from '../../../src/i18n';

export default function More() {
  const router = useRouter();
  const me = useMe();
  const { signOut } = useSession();

  return (
    <>
      <Header title="More" back={false} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card style={{ padding: 0 }}>
          <ListRow
            title={t('catalog.customers')}
            onPress={() => router.push('/(owner)/catalog/customers')}
          />
          <Divider />
          <ListRow
            title={t('catalog.materials')}
            onPress={() => router.push('/(owner)/catalog/material')}
          />
          <Divider />
          <ListRow
            title={t('catalog.skus')}
            onPress={() => router.push('/(owner)/catalog/sku')}
          />
          {/* Gated on businesses.features->>'packing' -- a per-business toggle
              that has existed in the schema since 0002 and was read by nothing
              until get_my_context started returning it. */}
          {me.hasPacking ? (
            <>
              <Divider />
              <ListRow
                title={t('packer.runs')}
                onPress={() => router.push('/(pack)/runs')}
              />
            </>
          ) : null}
        </Card>

        {me.can('manage_staff') ? (
          <Card style={{ padding: 0 }}>
            <ListRow
              title={t('staff.title')}
              subtitle={
                me.seats
                  ? t('staff.seats', { used: me.seats.used, limit: me.seats.limit })
                  : undefined
              }
              onPress={() => router.push('/(owner)/more/staff')}
            />
            <Divider />
            <ListRow
              title={t('settings.title')}
              onPress={() => router.push('/(owner)/more/settings')}
            />
          </Card>
        ) : null}

        <Card>
          <Text variant="secondary" tone="muted">
            {me.business?.name}
          </Text>
          <Text variant="meta" tone="muted">
            {me.role ? t(`roles.${me.role}`) : ''}
            {me.context?.profile?.full_name ? ` · ${me.context.profile.full_name}` : ''}
          </Text>
          {isDev ? (
            <Text variant="meta" tone="warning">
              dev build · {me.business?.subscription_status}
            </Text>
          ) : null}
        </Card>

        <Button label={t('common.signOut')} kind="secondary" onPress={signOut} />
      </ScrollView>
    </>
  );
}
