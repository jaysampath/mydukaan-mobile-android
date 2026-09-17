import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { newId } from '../../../src/api/ids';
import { useMembers } from '../../../src/data/queries';
import {
  useInviteMember,
  useRevokeMemberInvite,
  useSetMemberActive,
  useSetMemberRole,
} from '../../../src/data/mutations';
import { mapRpcError } from '../../../src/data/errors';
import type { MemberRoleInput } from '../../../src/api/rpc';
import {
  Button,
  Card,
  Choice,
  Divider,
  Field,
  Header,
  ListRow,
  Loading,
  Text,
} from '../../../src/theme/components';
import { space } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

/**
 * Staff.
 *
 * Before the tenant-side RPCs in migration 0019, adding a packer meant asking a
 * platform operator to issue the invite from the admin portal -- so every hire
 * was a support call.
 *
 * The seat meter is honest now: `app.seats_used()` counts active members PLUS
 * live unclaimed invites, so a promised seat is reserved from the moment it is
 * promised. Before that fix an owner could mint ten valid codes against five
 * seats and the failure landed on the new hire's phone.
 *
 * Which is also why Revoke is prominent: an owner who typos a phone number has
 * just parked a seat for thirty days.
 */
export default function Staff() {
  const { data, isLoading } = useMembers();
  const invite = useInviteMember();
  const revoke = useRevokeMemberInvite();
  const setRole = useSetMemberRole();
  const setActive = useSetMemberActive();

  const [inviting, setInviting] = useState(false);
  const [role, setRoleChoice] = useState<MemberRoleInput>('PACKER');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Loading />;

  const full = data.seats.available <= 0;

  const send = async () => {
    setError(null);
    try {
      await invite.mutateAsync({ inviteId: newId(), role, phone: phone.trim() });
      setInviting(false);
      setPhone('');
    } catch (e) {
      // Carries the server's own wording, e.g. "all 5 seats are in use".
      setError(mapRpcError(e).message);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      // Includes the last-owner guards, which arrive as 23514 with a hint.
      setError(mapRpcError(e).message);
    }
  };

  return (
    <>
      <Header
        title={t('staff.title')}
        subtitle={t('staff.seats', { used: data.seats.used, limit: data.seats.limit })}
      />

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        {error ? (
          <Text variant="secondary" tone="danger">
            {error}
          </Text>
        ) : null}

        <Card style={{ padding: 0 }}>
          {data.members.map((m, i) => (
            <View key={m.user_id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={`${m.full_name || '—'}${m.is_self ? ` (${t('staff.you')})` : ''}`}
                subtitle={`${t(`roles.${m.role}`)}${m.is_active ? '' : ` · ${t('staff.inactive')}`}`}
                right={
                  m.is_self ? null : (
                    <Button
                      label={m.is_active ? t('staff.deactivate') : t('staff.reactivate')}
                      kind="ghost"
                      block={false}
                      onPress={() =>
                        act(() =>
                          setActive.mutateAsync({ userId: m.user_id, isActive: !m.is_active }),
                        )
                      }
                    />
                  )
                }
              />
              {!m.is_self ? (
                <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
                  <Choice
                    value={m.role}
                    onChange={(r) => act(() => setRole.mutateAsync({ userId: m.user_id, role: r }))}
                    options={(['OWNER', 'MANAGER', 'PACKER', 'DELIVERY'] as const).map((r) => ({
                      value: r,
                      label: t(`roles.${r}`),
                    }))}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </Card>

        {data.invites.length > 0 ? (
          <Card style={{ padding: 0 }}>
            <View style={{ padding: space.lg, paddingBottom: 0 }}>
              <Text variant="bodyStrong">{t('staff.pending')}</Text>
            </View>
            {data.invites.map((inv) => (
              <View key={inv.id}>
                <Divider />
                <ListRow
                  title={t(`roles.${inv.role}`)}
                  subtitle={inv.phone ?? inv.email ?? undefined}
                  right={
                    <View style={{ gap: space.xs }}>
                      <Button
                        label={t('staff.shareCode')}
                        kind="ghost"
                        block={false}
                        onPress={() =>
                          Linking.openURL(
                            `whatsapp://send?text=${encodeURIComponent(
                              `Your code to join on My Dukaan: ${inv.token}`,
                            )}`,
                          ).catch(() => {})
                        }
                      />
                      <Button
                        label={t('staff.revoke')}
                        kind="ghost"
                        block={false}
                        onPress={() => act(() => revoke.mutateAsync(inv.id))}
                      />
                    </View>
                  }
                />
              </View>
            ))}
          </Card>
        ) : null}

        {inviting ? (
          <Card>
            <Choice
              label={t('staff.role')}
              value={role}
              onChange={setRoleChoice}
              options={(['MANAGER', 'PACKER', 'DELIVERY'] as const).map((r) => ({
                value: r,
                label: t(`roles.${r}`),
              }))}
            />
            <Field
              label={t('catalog.phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Button
              label={t('staff.invite')}
              onPress={send}
              loading={invite.isPending}
              disabled={phone.trim().length === 0}
            />
            <Button label={t('common.cancel')} kind="ghost" onPress={() => setInviting(false)} />
          </Card>
        ) : (
          <Button
            label={full ? t('staff.seatsFull') : t('staff.invite')}
            onPress={() => setInviting(true)}
            disabled={full}
          />
        )}
      </ScrollView>
    </>
  );
}
