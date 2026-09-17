import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { newId } from '../../../src/api/ids';
import { usePackedSkus, useRawMaterials } from '../../../src/data/queries';
import { useSavePackedSku } from '../../../src/data/mutations';
import { mapRpcError } from '../../../src/data/errors';
import {
  ActionBar,
  Button,
  Choice,
  Divider,
  EmptyState,
  Field,
  Header,
  ListRow,
  Loading,
  Money,
  NumberField,
  PackSize,
  Qty,
  Text,
} from '../../../src/theme/components';
import { space } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

interface Draft {
  id: string;
  rawMaterialId: string;
  name: string;
  packSize: string;
  price: string;
}

/**
 * Packet sizes -- what actually gets sold.
 *
 * Each one belongs to a bulk product and carries a pack size, which is what
 * makes the conversion arithmetic possible: a packing run turns N grams of bulk
 * into M packets, and `create_packing_run` derives the wastage from the
 * difference rather than trusting anyone to enter it.
 *
 * Pack sizes are values, not an enum: 1kg/500g/250g/100g/50g is this business's
 * set, and the next business will have a different one.
 */
export default function Skus() {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const materials = useRawMaterials();
  const { data, isLoading } = usePackedSkus(null, true);
  const save = useSavePackedSku();

  const submit = async () => {
    if (!editing) return;
    setError(null);
    try {
      await save.mutateAsync({
        id: editing.id,
        rawMaterialId: editing.rawMaterialId,
        name: editing.name.trim(),
        packSizeBase: Number(editing.packSize),
        salePrice: Number(editing.price) || 0,
      });
      setEditing(null);
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  if (editing) {
    const valid =
      editing.name.trim().length > 0 &&
      editing.rawMaterialId.length > 0 &&
      Number(editing.packSize) > 0;
    return (
      <>
        <Header title={t('catalog.newSku')} />
        <View style={{ padding: space.lg, gap: space.md }}>
          <Choice
            label={t('catalog.bulkProduct')}
            value={editing.rawMaterialId}
            onChange={(v) => setEditing({ ...editing, rawMaterialId: v })}
            options={(materials.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
          />
          <Field
            label={t('catalog.name')}
            value={editing.name}
            onChangeText={(v) => setEditing({ ...editing, name: v })}
            autoCapitalize="words"
            hint="For example: Turmeric 500g"
          />
          <NumberField
            label={t('catalog.packSize')}
            value={editing.packSize}
            onChangeText={(v) => setEditing({ ...editing, packSize: v })}
            hint="500 means a 500 g packet"
          />
          <NumberField
            label={t('catalog.salePrice')}
            value={editing.price}
            onChangeText={(v) => setEditing({ ...editing, price: v })}
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
            disabled={!valid}
          />
          <Button label={t('common.cancel')} kind="ghost" onPress={() => setEditing(null)} />
        </View>
      </>
    );
  }

  const noMaterials = (materials.data ?? []).length === 0;

  return (
    <>
      <Header title={t('catalog.skus')} />
      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(s) => s.id}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={
            <EmptyState
              title="No packet sizes yet"
              detail={
                noMaterials
                  ? 'Add a bulk product first, then the packet sizes you sell it in.'
                  : 'Add the packet sizes you sell.'
              }
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={item.raw_material_name}
              onPress={() =>
                setEditing({
                  id: item.id,
                  rawMaterialId: item.raw_material_id,
                  name: item.name,
                  packSize: String(item.pack_size_base),
                  price: String(item.sale_price),
                })
              }
              right={
                <>
                  <Money value={item.sale_price} />
                  <PackSize value={item.pack_size_base} />
                  <Qty value={item.qty_packets} kind="PACKED" variant="meta" tone="muted" />
                </>
              }
            />
          )}
        />
      )}
      <ActionBar>
        <Button
          label={t('catalog.newSku')}
          disabled={noMaterials}
          onPress={() =>
            setEditing({
              id: newId(),
              rawMaterialId: materials.data?.[0]?.id ?? '',
              name: '',
              packSize: '',
              price: '',
            })
          }
        />
      </ActionBar>
    </>
  );
}
