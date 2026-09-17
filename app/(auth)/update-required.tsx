import { View } from 'react-native';

import { useMe } from '../../src/auth/context';
import { Button, Screen, Text } from '../../src/theme/components';
import { space } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * This build is too old to read the server's payloads safely.
 *
 * Blocking, and deliberately so. With no local schema to diff against, a build
 * behind the API contract does not fail loudly -- it renders `undefined` where
 * a rupee figure should be, on a screen where someone is collecting cash.
 * Refusing to continue is the only safe behaviour.
 */
export default function UpdateRequired() {
  const me = useMe();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.lg, padding: space.xl }}>
        <Text variant="title">{t('auth.updateTitle')}</Text>
        <Text variant="body" tone="muted">
          {t('auth.updateDetail')}
        </Text>
        <Button label={t('common.retry')} onPress={() => me.refetch()} />
      </View>
    </Screen>
  );
}
