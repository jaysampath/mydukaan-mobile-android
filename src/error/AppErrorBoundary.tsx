import { Component, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, Screen, Text } from '../theme/components';
import { mapRpcError } from '../data/errors';
import { isDev } from '../env';
import { space } from '../theme/tokens';
import { t } from '../i18n';

/**
 * The last line of defence.
 *
 * Deliberately plain. A crash screen that tries to be clever is a crash screen
 * that crashes. Route-level boundaries handle the recoverable cases -- a failed
 * query, a refused write -- and each screen renders those inline; this one only
 * catches a render that threw.
 *
 * The detail block is dev-only. A shop owner cannot act on a stack trace, and
 * showing one makes a recoverable hiccup look like a broken app.
 */
interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[app] unhandled render error', error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const friendly = mapRpcError(error);

    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.lg, padding: space.xl }}>
          <Text variant="title">{t('common.somethingWrong')}</Text>
          <Text variant="body" tone="muted">
            {friendly.message}
          </Text>
          <Button label={t('common.retry')} onPress={this.reset} />
          {isDev ? (
            <ScrollView style={{ maxHeight: 220 }}>
              <Text variant="meta" tone="muted">
                {error.stack ?? String(error)}
              </Text>
            </ScrollView>
          ) : null}
        </View>
      </Screen>
    );
  }
}
