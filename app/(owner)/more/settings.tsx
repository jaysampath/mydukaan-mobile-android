import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useMe } from '../../../src/auth/context';
import { useUpdateBusinessSettings } from '../../../src/data/mutations';
import { mapRpcError } from '../../../src/data/errors';
import {
  Button,
  Card,
  Field,
  Header,
  Loading,
  Text,
} from '../../../src/theme/components';
import { colors, radius, space, touch } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

/**
 * Shop settings.
 *
 * The GSTIN toggle is the one thing on this screen with a product rule attached:
 * it is free on every plan and must NEVER sit behind the paywall. A receipt is
 * a payment confirmation, not a tax invoice, and a shop that has a GSTIN should
 * be able to show it without paying anyone. It is placed prominently and
 * labelled as free, which is the commitment made in the locked decisions.
 */
export default function Settings() {
  const me = useMe();
  const save = useUpdateBusinessSettings();

  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [showGstin, setShowGstin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me.business) return;
    setName(me.business.name);
    setGstin(me.business.gstin ?? '');
    setShowGstin(me.business.show_gstin_on_receipt);
  }, [me.business]);

  if (me.isLoading || !me.business) return <Loading />;

  const submit = async () => {
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync({
        name: name.trim(),
        gstin: gstin.trim() || null,
        showGstinOnReceipt: showGstin,
      });
      setSaved(true);
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  return (
    <>
      <Header title={t('settings.title')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Field label={t('settings.shopName')} value={name} onChangeText={setName} />

        <Card>
          <Field
            label={t('settings.gstin')}
            value={gstin}
            onChangeText={(v) => setGstin(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            hint="15 characters"
          />
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: showGstin }}
            onPress={() => setShowGstin((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.min }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: radius.sm,
                borderWidth: 2,
                borderColor: showGstin ? colors.primary : colors.border,
                backgroundColor: showGstin ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {showGstin ? (
                <Text variant="bodyStrong" tone="onPrimary">
                  ✓
                </Text>
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="body">{t('settings.showGstin')}</Text>
              {/* Never paywalled. Said out loud, on the screen. */}
              <Text variant="meta" tone="success">
                {t('settings.showGstinDetail')}
              </Text>
            </View>
          </Pressable>
        </Card>

        {error ? (
          <Text variant="secondary" tone="danger">
            {error}
          </Text>
        ) : null}
        {saved ? (
          <Text variant="secondary" tone="success">
            Saved
          </Text>
        ) : null}

        <Button
          label={t('common.save')}
          onPress={submit}
          loading={save.isPending}
          disabled={me.isReadOnly}
        />
      </ScrollView>
    </>
  );
}
