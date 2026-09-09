import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';

import { branding } from '../../../branding.config';
import { env } from '../../env';
import { database, type Customer } from '../../db';
import { auth, RpcError } from '../../api/supabase';
import { bootstrapBusiness } from '../../api/rpc';
import { saveCustomer } from '../../api/writes';
import { isOnline, startAutoSync, sync, type SyncState } from '../../sync/sync';

/**
 * Phase 0 proof.
 *
 * The acceptance criterion is narrow and worth stating plainly: a record
 * created on device A must appear on device B after a sync cycle.
 * Everything on this screen exists to make that observable --
 * reads come from the local cache and work with no signal, writes go through
 * the online RPCs, and the sync bar shows what has reached the server.
 *
 * Offline WRITES are off -- see docs/adr/0002-sync-mode-flag.md.
 *
 * Feature work (Phases 1-7) does not start until this is confirmed on two real
 * devices.
 */
export function Phase0Screen() {
  const [session, setSession] = useState<{ userId: string } | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    auth.getSession().then(({ data }) => {
      setSession(data.session ? { userId: data.session.user.id } : null);
      setBooting(false);
    });
    const { data: sub } = auth.onAuthStateChange((_event, s) => {
      setSession(s ? { userId: s.user.id } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (booting) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={branding.colors.primary} />
      </View>
    );
  }

  return session ? <SyncProof userId={session.userId} /> : <SignIn />;
}

// ---------------------------------------------------------------------------
// Sign in. Phase 1 replaces this with phone + OTP, which needs an SMS provider
// configured on the Supabase project. Email/password is the stand-in so Phase 0
// can be proven without waiting on that.
// ---------------------------------------------------------------------------

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (mode: 'in' | 'up') => {
      setBusy(true);
      setError(null);
      const { error: err } =
        mode === 'in'
          ? await auth.signInWithPassword({ email, password })
          : await auth.signUp({ email, password });
      if (err) setError(err.message);
      setBusy(false);
    },
    [email, password],
  );

  return (
    <View style={[styles.screen, styles.padded]}>
      <Text style={styles.title}>{branding.displayName}</Text>
      <Text style={styles.subtitle}>Phase 0 — offline sync proof ({env.appEnv})</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={branding.colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={branding.colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button label="Sign in" onPress={() => submit('in')} disabled={busy} />
      <Button label="Create account" onPress={() => submit('up')} disabled={busy} variant="ghost" />

      <Text style={styles.note}>
        Sign in on two devices with the same account to run the Phase 0 test.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The proof itself.
// ---------------------------------------------------------------------------

function SyncProof({ userId }: { userId: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle', lastSyncedAt: null });
  const [online, setOnline] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [needsBusiness, setNeedsBusiness] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const customersCollection = useMemo(
    () => database.collections.get<Customer>('customers'),
    [],
  );

  // Live query. The list updates the instant a row is written locally --
  // there is no loading state between "user tapped save" and "user sees it",
  // because nothing waits on the network.
  useEffect(() => {
    const sub = customersCollection
      .query(Q.sortBy('created_at', Q.desc))
      .observe()
      .subscribe(setCustomers);
    return () => sub.unsubscribe();
  }, [customersCollection]);

  // Derived rather than queried: `_status` is a WatermelonDB system column, not
  // part of the schema, so Q.where cannot see it. The list is already observed,
  // so counting in JS costs nothing and cannot go stale relative to it.
  const pending = useMemo(
    () => customers.filter((c) => c.syncStatus !== 'synced').length,
    [customers],
  );

  useEffect(() => startAutoSync(setSyncState), []);

  useEffect(() => {
    void isOnline().then(setOnline);
  }, [syncState]);

  // A brand-new account has no business until it makes one. Detected from the
  // sync failing with 42501 rather than by guessing.
  useEffect(() => {
    if (syncState.status === 'error' && syncState.error.includes('not an active member')) {
      setNeedsBusiness(true);
    }
  }, [syncState]);

  const addCustomer = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);

    // Goes through the online RPC, not database.write().
    //
    // Under SYNC_MODE=pull_only the device must not write to local SQLite: the
    // row would have no way to reach the server, and sync() refuses a cycle
    // that finds unexpected local changes rather than letting WatermelonDB
    // mark it synced and drop it. saveCustomer commits on the server and then
    // refreshes the cache, so the list still updates from one source.
    try {
      await saveCustomer({ name: trimmed });
      setName('');
    } catch (e) {
      // Offline is an expected state here, not a crash. Keep what they typed.
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [name]);

  const createBusiness = useCallback(async () => {
    try {
      await bootstrapBusiness(businessName.trim() || 'My Shop');
      setNeedsBusiness(false);
      await sync();
    } catch (e) {
      setError(e instanceof RpcError ? e.message : String(e));
    }
  }, [businessName]);

  if (needsBusiness) {
    return (
      <View style={[styles.screen, styles.padded]}>
        <Text style={styles.title}>Name your business</Text>
        <Text style={styles.subtitle}>This creates your tenant and starts the 30-day trial.</Text>
        <TextInput
          style={styles.input}
          placeholder="Business name"
          placeholderTextColor={branding.colors.muted}
          value={businessName}
          onChangeText={setBusinessName}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Create" onPress={createBusiness} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SyncBar state={syncState} online={online} pending={pending} />

      <View style={styles.padded}>
        <Text style={styles.title}>Customers</Text>
        <Text style={styles.subtitle}>
          Turn airplane mode on, add a customer, then turn it off. It should appear on the other
          device within a few seconds.
        </Text>

        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.rowInput]}
            placeholder="Customer name"
            placeholderTextColor={branding.colors.muted}
            value={name}
            onChangeText={setName}
            onSubmitEditing={addCustomer}
            returnKeyType="done"
          />
          <Button label="Add" onPress={addCustomer} compact />
        </View>
      </View>

      <FlatList
        data={customers}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.note}>No customers yet. Add one — it works offline.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardMain}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>
                {item.createdAt ? item.createdAt.toLocaleString() : 'just now'}
              </Text>
            </View>
            <Text
              style={[
                styles.badge,
                item.syncStatus === 'synced' ? styles.badgeSynced : styles.badgePending,
              ]}
            >
              {item.syncStatus === 'synced' ? 'synced' : 'on device'}
            </Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText} numberOfLines={1}>
          {env.appEnv} · user {userId.slice(0, 8)}
        </Text>
        <Button label="Sign out" onPress={() => auth.signOut()} variant="ghost" compact />
      </View>
    </View>
  );
}

function SyncBar({
  state,
  online,
  pending,
}: {
  state: SyncState;
  online: boolean | null;
  pending: number;
}) {
  const offline = online === false;
  const label = offline
    ? 'Offline — your work is saved on this phone'
    : state.status === 'syncing'
      ? 'Syncing…'
      : state.status === 'error'
        ? `Sync problem: ${state.error}`
        : pending > 0
          ? `${pending} waiting to sync`
          : 'All synced';

  return (
    <View
      style={[
        styles.syncBar,
        offline ? styles.syncBarOffline : null,
        state.status === 'error' && !offline ? styles.syncBarError : null,
      ]}
    >
      <Text style={styles.syncText} numberOfLines={2}>
        {label}
      </Text>
      {state.status !== 'syncing' && !offline ? (
        <Pressable onPress={() => void sync().catch(() => {})} hitSlop={12}>
          <Text style={styles.syncAction}>Sync now</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  variant = 'solid',
  compact,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'ghost';
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'ghost' && styles.buttonGhost,
        compact && styles.buttonCompact,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={[styles.buttonLabel, variant === 'ghost' && styles.buttonLabelGhost]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: branding.colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  padded: { padding: 20, gap: 12 },

  title: { fontSize: 24, fontWeight: '700', color: branding.colors.text },
  subtitle: { fontSize: 14, color: branding.colors.muted, lineHeight: 20 },
  note: { fontSize: 13, color: branding.colors.muted, marginTop: 8, lineHeight: 18 },
  error: { fontSize: 13, color: branding.colors.danger },

  input: {
    borderWidth: 1,
    borderColor: branding.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    // iOS text inputs need more vertical padding to match Android's intrinsic
    // height. This is the kind of delta Platform.select is for; anything larger
    // belongs in a .ios.tsx / .android.tsx split.
    paddingVertical: Platform.select({ ios: 14, android: 10, default: 12 }),
    fontSize: 16,
    color: branding.colors.text,
    backgroundColor: branding.colors.surface,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowInput: { flex: 1 },

  button: {
    backgroundColor: branding.colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  buttonCompact: { paddingVertical: 12, paddingHorizontal: 16 },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { color: branding.colors.onPrimary, fontSize: 16, fontWeight: '600' },
  buttonLabelGhost: { color: branding.colors.primary },

  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: branding.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: branding.colors.border,
  },
  syncBarOffline: { backgroundColor: '#FFF4E0' },
  syncBarError: { backgroundColor: '#FDECEA' },
  syncText: { flex: 1, fontSize: 13, color: branding.colors.text },
  syncAction: { fontSize: 13, fontWeight: '600', color: branding.colors.primary },

  listContent: { paddingHorizontal: 20, paddingBottom: 20, gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: branding.colors.border,
    backgroundColor: branding.colors.background,
  },
  cardMain: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: branding.colors.text },
  cardMeta: { fontSize: 12, color: branding.colors.muted },
  badge: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  badgeSynced: { color: branding.colors.success, backgroundColor: '#E7F2EC' },
  badgePending: { color: branding.colors.warning, backgroundColor: '#FFF4E0' },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: branding.colors.border,
  },
  footerText: { flex: 1, fontSize: 12, color: branding.colors.muted },
});
