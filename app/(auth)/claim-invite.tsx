import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useSession } from '../../src/auth/session';
import { useClaimInvite } from '../../src/data/mutations';
import { mapRpcError } from '../../src/data/errors';
import { Button, Field, Screen, Text } from '../../src/theme/components';
import { space } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * Join the business you were invited to.
 *
 * Reached when `get_my_context` reports `membership_state: 'NONE'` -- a real
 * server-side fact, not a guess from an error message.
 *
 * Server messages are surfaced verbatim on purpose. "This invitation has
 * expired" and "this business has used all 5 of its seats" are written in SQL
 * for a person to read, and they name specifics this screen does not know.
 */
export default function ClaimInvite() {
  const router = useRouter();
  const { signOut } = useSession();
  const claim = useClaimInvite();

  const [token, setToken] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await claim.mutateAsync({ token: token.trim(), fullName: fullName.trim() });
      // The mutation invalidates the context, so index.tsx re-resolves and
      // routes to the right shell for whatever role the invite carried.
      router.replace('/');
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  return (
    <Screen scroll style={{ flexGrow: 1, justifyContent: 'center', gap: space.lg }}>
      <View style={{ gap: space.xs, marginBottom: space.md }}>
        <Text variant="title">{t('auth.claimTitle')}</Text>
        <Text variant="secondary" tone="muted">
          {t('auth.claimSubtitle')}
        </Text>
      </View>

      <Field
        label={t('auth.claimName')}
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
      />
      <Field
        label={t('auth.claimCode')}
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
      />

      {error ? (
        <Text variant="secondary" tone="danger">
          {error}
        </Text>
      ) : null}

      <Button
        label={t('auth.claimAction')}
        onPress={submit}
        loading={claim.isPending}
        disabled={token.trim().length === 0 || fullName.trim().length === 0}
      />
      <Button label={t('common.signOut')} kind="ghost" onPress={signOut} />
    </Screen>
  );
}
