import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { newId } from '../../../src/api/ids';
import { useCustomers } from '../../../src/data/queries';
import { useSaveCustomer } from '../../../src/data/mutations';
import { mapRpcError } from '../../../src/data/errors';
import {
  ActionBar,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Header,
  ListRow,
  Loading,
  Money,
  SearchBar,
  Text,
} from '../../../src/theme/components';
import { space } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

/**
 * Customers.
 *
 * `upsert_customer` means create and edit are the same call with the same
 * shape: the client mints the id, so "save this new one" and "save my change"
 * are indistinguishable to the server and either can be retried. That is why
 * this is one screen rather than two.
 */
export default function Customers() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useCustomers(search || null);
  const save = useSaveCustomer();

  const submit = async () => {
    if (!editing) return;
    setError(null);
    try {
      await save.mutateAsync({
        id: editing.id,
        name: editing.name.trim(),
        phone: editing.phone.trim() || null,
      });
      setEditing(null);
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  if (editing) {
    return (
      <>
        <Header title={t('catalog.newCustomer')} />
        <View style={{ padding: space.lg, gap: space.md }}>
          <Field
            label={t('catalog.name')}
            value={editing.name}
            onChangeText={(v) => setEditing({ ...editing, name: v })}
            autoCapitalize="words"
            autoFocus
          />
          <Field
            label={t('catalog.phone')}
            value={editing.phone}
            onChangeText={(v) => setEditing({ ...editing, phone: v })}
            keyboardType="phone-pad"
          />
          {error ? (
            <Text variant="secondary" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button
            label={t('common.save')}
            onPress={submit}
            loading={save.isPending}
            disabled={editing.name.trim().length === 0}
          />
          <Button label={t('common.cancel')} kind="ghost" onPress={() => setEditing(null)} />
        </View>
      </>
    );
  }

  return (
    <>
      <Header title={t('catalog.customers')} />
      <SearchBar value={search} onChangeText={setSearch} placeholder={t('common.search')} />

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data?.rows ?? []}
          keyExtractor={(c) => c.id}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={
            <EmptyState
              title="No customers yet"
              detail="Add the shops you sell to and they will show up here."
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={item.phone ?? undefined}
              onPress={() =>
                setEditing({ id: item.id, name: item.name, phone: item.phone ?? '' })
              }
              right={
                item.outstanding > 0 ? <Money value={item.outstanding} tone="warning" /> : undefined
              }
            />
          )}
        />
      )}

      <ActionBar>
        <Button
          label={t('catalog.newCustomer')}
          // The id is minted when the form OPENS, so a double-tap on Save sends
          // the same id twice and the server creates one customer.
          onPress={() => setEditing({ id: newId(), name: '', phone: '' })}
        />
      </ActionBar>
    </>
  );
}
