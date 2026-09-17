import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { newId } from '../../../src/api/ids';
import { useRawMaterials } from '../../../src/data/queries';
import { useSaveRawMaterial } from '../../../src/data/mutations';
import { mapRpcError } from '../../../src/data/errors';
import {
  ActionBar,
  Button,
  Divider,
  EmptyState,
  Field,
  Header,
  ListRow,
  Loading,
  NumberField,
  Qty,
  Text,
} from '../../../src/theme/components';
import { space } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

/**
 * Bulk products -- the sacks, before anything is packed.
 *
 * Deliberately a separate entity from a packet size (see ./sku.tsx). Bulk
 * turmeric and a 500 g packet of turmeric are not two views of one thing: they
 * have different quantities, different units and a conversion between them, and
 * collapsing them is what makes stock arithmetic go wrong.
 *
 * "Warn me below" writes `reorder_level_base`, which drives the low-stock count
 * on Today and the badge on the stock screen.
 */
export default function Materials() {
  const [editing, setEditing] = useState<{ id: string; name: string; reorder: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useRawMaterials(true);
  const save = useSaveRawMaterial();

  const submit = async () => {
    if (!editing) return;
    setError(null);
    try {
      await save.mutateAsync({
        id: editing.id,
        name: editing.name.trim(),
        reorderLevelBase: Number(editing.reorder) || 0,
      });
      setEditing(null);
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  if (editing) {
    return (
      <>
        <Header title={t('catalog.newMaterial')} />
        <View style={{ padding: space.lg, gap: space.md }}>
          <Field
            label={t('catalog.name')}
            value={editing.name}
            onChangeText={(v) => setEditing({ ...editing, name: v })}
            autoCapitalize="words"
            autoFocus
            hint="For example: Turmeric (bulk)"
          />
          <NumberField
            label={t('catalog.reorderLevel')}
            value={editing.reorder}
            onChangeText={(v) => setEditing({ ...editing, reorder: v })}
            hint="5000 means warn me below 5 kg"
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
      <Header title={t('catalog.materials')} />
      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(m) => m.id}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={
            <EmptyState
              title="No bulk products yet"
              detail="Add what you buy in sacks. Packet sizes come next."
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={item.is_active ? undefined : 'Archived'}
              onPress={() =>
                setEditing({
                  id: item.id,
                  name: item.name,
                  reorder: String(item.reorder_level_base),
                })
              }
              right={
                <Qty
                  value={item.qty_base}
                  kind="RAW"
                  baseUnit={item.base_unit}
                  tone={item.below_reorder ? 'warning' : 'default'}
                />
              }
            />
          )}
        />
      )}
      <ActionBar>
        <Button
          label={t('catalog.newMaterial')}
          onPress={() => setEditing({ id: newId(), name: '', reorder: '0' })}
        />
      </ActionBar>
    </>
  );
}
