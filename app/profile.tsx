import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useMe } from '../src/auth/context';
import { useUpdateMyProfile } from '../src/data/mutations';
import { mapRpcError } from '../src/data/errors';
import { Avatar, Button, Card, Field, Header, Loading, Text } from '../src/theme/components';
import { space } from '../src/theme/tokens';
import { t } from '../src/i18n';

/**
 * Your own name and phone.
 *
 * At the root of the router rather than inside (owner), because every role
 * opens it from the drawer and the (owner) shell redirects packers and
 * delivery staff away.
 *
 * Role is shown but not editable: update_my_profile deliberately has no role
 * parameter, or every member would be their own administrator.
 */
export default function Profile() {
  const me = useMe();
  const save = useUpdateMyProfile();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const profile = me.context?.profile;
  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
  }, [profile]);

  if (me.isLoading || !profile) return <Loading />;

  const submit = async () => {
    setError(null);
    setSaved(false);
    if (!name.trim()) {
      setError(t('profile.nameRequired'));
      return;
    }
    try {
      // A blank phone is sent as null, which the server reads as "unchanged".
      await save.mutateAsync({ fullName: name.trim(), phone: phone.trim() || null });
      setSaved(true);
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  return (
    <>
      <Header title={t('profile.title')} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
          <Avatar name={name || profile.full_name} size={72} />
          <Text variant="title">{name || t('drawer.noName')}</Text>
          <Text variant="secondary" tone="muted">
            {[t(`roles.${profile.role}`), me.business?.name].filter(Boolean).join(' · ')}
          </Text>
        </Card>

        <Card>
          <Field label={t('profile.name')} value={name} onChangeText={setName} />
          <Field
            label={t('profile.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
          />
          <View style={{ paddingTop: space.xs }}>
            <Text variant="meta" tone="muted">
              {t('profile.roleNote')}
            </Text>
          </View>
        </Card>

        {error ? (
          <Text variant="secondary" tone="danger">
            {error}
          </Text>
        ) : null}
        {saved ? (
          <Text variant="secondary" tone="success">
            {t('profile.saved')}
          </Text>
        ) : null}

        <Button
          label={t('common.save')}
          icon="checkmark"
          onPress={submit}
          loading={save.isPending}
          disabled={me.isReadOnly}
        />
      </ScrollView>
    </>
  );
}
