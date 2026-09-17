import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useSession } from '../src/auth/session';
import { useMe } from '../src/auth/context';
import { resolveLanding } from '../src/auth/landing';
import { mapRpcError } from '../src/data/errors';
import { Button, Loading, Screen, Text } from '../src/theme/components';
import { space } from '../src/theme/tokens';
import { t } from '../src/i18n';

/**
 * The only route that decides where anyone goes.
 *
 * Keeping the decision in one place, driven by one pure function
 * (`resolveLanding`), is what stops it being re-derived slightly differently in
 * three layouts. That function is unit-tested; this file supplies it with state
 * and renders the answer.
 */
export default function Index() {
  const { session, loading: sessionLoading, signOut } = useSession();
  const me = useMe();

  // Waiting for the persisted session to come off disk.
  if (sessionLoading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (!session) return <Redirect href="/(auth)/sign-in" />;

  // Signed in, but we do not yet know what they may do. Do NOT guess into the
  // app: landing on the wrong shell and bouncing out is worse than a spinner.
  if (me.isLoading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  /**
   * get_my_context is a single point of failure for the entire shell -- role,
   * features, seats and read-only state all come from it -- so it gets its own
   * degraded screen rather than falling into the error boundary or, worse,
   * redirecting to /blocked and telling the user they were deactivated when in
   * fact the request timed out.
   */
  if (me.isError || !me.context) {
    const friendly = mapRpcError(me.error);
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.lg, padding: space.xl }}>
          <Text variant="title">Couldn&apos;t load your shop</Text>
          <Text variant="body" tone="muted">
            {friendly.message}
          </Text>
          <Button label={t('common.retry')} onPress={() => me.refetch()} />
          <Button label={t('common.signOut')} kind="ghost" onPress={signOut} />
        </View>
      </Screen>
    );
  }

  const href = resolveLanding({
    hasSession: true,
    membershipState: me.context.membership_state,
    role: me.role,
    serverMinClient: me.context.contract?.min_client,
  });

  return <Redirect href={href} />;
}
