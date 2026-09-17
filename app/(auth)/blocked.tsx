import { View } from 'react-native';

import { useSession } from '../../src/auth/session';
import { Button, Screen, Text } from '../../src/theme/components';
import { space } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * Your access was turned off.
 *
 * Distinguishable from "you never joined a business" only because of the
 * profiles_self_select policy added in migration 0017 -- before it, a
 * deactivated user's own profile row was invisible to them and both cases
 * looked identical.
 */
export default function Blocked() {
  const { signOut } = useSession();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.lg, padding: space.xl }}>
        <Text variant="title">{t('auth.blockedTitle')}</Text>
        <Text variant="body" tone="muted">
          {t('auth.blockedDetail')}
        </Text>
        <Button label={t('common.signOut')} onPress={signOut} />
      </View>
    </Screen>
  );
}
