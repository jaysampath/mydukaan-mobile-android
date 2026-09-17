import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { branding } from '../../branding.config';
import { strategy } from '../../src/auth/strategies';
import { mapRpcError } from '../../src/data/errors';
import { Button, Field, Screen, Text } from '../../src/theme/components';
import { space } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * Sign in.
 *
 * The screen does not know whether it is doing email/password or phone/OTP --
 * it renders from `strategy.kind` and calls `start` / `verify`. That is what
 * makes the eventual switch to SMS a flag change rather than a rewrite.
 *
 * There is deliberately no sign-up. A business is created by a platform
 * operator in the admin portal, and a person joins with an invitation code. An
 * app that let anyone create a tenant would also let anyone create a tenant by
 * accident, and there is no route back from that for a non-technical user.
 */
export default function SignIn() {
  const router = useRouter();
  const otp = strategy.kind === 'otp';

  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = codeSent
        ? await strategy.verify(identifier, secret)
        : await strategy.start(identifier, secret);

      if (result.done) {
        // The session listener drives routing; index.tsx decides where to go.
        router.replace('/');
      } else {
        setCodeSent(true);
        setSecret('');
      }
    } catch (e) {
      setError(mapRpcError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    identifier.trim().length > 0 && (otp && !codeSent ? true : secret.trim().length > 0);

  return (
    <Screen scroll style={{ flexGrow: 1, justifyContent: 'center', gap: space.lg }}>
      <View style={{ gap: space.xs, marginBottom: space.md }}>
        <Text variant="display">{branding.displayName}</Text>
        <Text variant="secondary" tone="muted">
          {t('auth.signInSubtitle')}
        </Text>
      </View>

      <Field
        label={otp ? t('auth.phone') : t('auth.email')}
        value={identifier}
        onChangeText={setIdentifier}
        editable={!codeSent}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={otp ? 'phone-pad' : 'email-address'}
        textContentType={otp ? 'telephoneNumber' : 'emailAddress'}
      />

      {otp && !codeSent ? null : (
        <Field
          label={otp ? t('auth.otpCode') : t('auth.password')}
          value={secret}
          onChangeText={setSecret}
          secureTextEntry={!otp}
          keyboardType={otp ? 'number-pad' : 'default'}
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}

      {error ? (
        <Text variant="secondary" tone="danger">
          {error}
        </Text>
      ) : null}

      <Button
        label={otp && !codeSent ? t('auth.sendCode') : otp ? t('auth.verify') : t('auth.signIn')}
        onPress={submit}
        loading={busy}
        disabled={!canSubmit}
      />

      <Text variant="meta" tone="muted" style={{ textAlign: 'center' }}>
        {t('auth.noSignUp')}
      </Text>
    </Screen>
  );
}
