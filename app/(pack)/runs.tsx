import { useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';

import { newId } from '../../src/api/ids';
import { useMe } from '../../src/auth/context';
import { usePackedSkus, usePackingRuns, useRawMaterials } from '../../src/data/queries';
import { useCreatePackingRun } from '../../src/data/mutations';
import { mapRpcError } from '../../src/data/errors';
import {
  ActionBar,
  Button,
  Card,
  Choice,
  Divider,
  EmptyState,
  Header,
  ListRow,
  Loading,
  NumberField,
  Qty,
  Text,
} from '../../src/theme/components';
import { formatDate } from '../../src/format/date';
import { formatRawQty } from '../../src/format/qty';
import { space } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * Packing: bulk in, packets out.
 *
 * The important design point is what this form does NOT ask for. Wastage is
 * never entered -- the server derives it as
 * `raw_consumed - packets * pack_size` and refuses a run where that is negative
 * (migration 0012). Two numbers that cannot disagree beat three that must be
 * cross-checked, and it means a packer cannot conjure stock by mistyping.
 *
 * The screen shows the derived wastage live, so the person doing the work can
 * see whether it looks right before saving.
 */
export default function PackingRuns() {
  const me = useMe();
  const runId = useRef(newId()).current;

  const [creating, setCreating] = useState(false);
  const [materialId, setMaterialId] = useState('');
  const [skuId, setSkuId] = useState('');
  const [consumed, setConsumed] = useState('');
  const [packets, setPackets] = useState('');
  const [error, setError] = useState<string | null>(null);

  const materials = useRawMaterials();
  const skus = usePackedSkus(materialId || null);
  const runs = usePackingRuns();
  const create = useCreatePackingRun();

  const sku = useMemo(() => skus.data?.find((s) => s.id === skuId), [skus.data, skuId]);
  const packedBase = (Number(packets) || 0) * (sku?.pack_size_base ?? 0);
  const wastage = (Number(consumed) || 0) - packedBase;
  const impossible = wastage < 0;

  const submit = async () => {
    setError(null);
    try {
      await create.mutateAsync({
        runId,
        rawMaterialId: materialId,
        packedSkuId: skuId,
        packetsProduced: Number(packets),
        rawConsumedBase: Number(consumed),
      });
      setCreating(false);
      setConsumed('');
      setPackets('');
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  if (!me.hasPacking) {
    return (
      <>
        <Header title={t('packer.runs')} back={false} />
        <EmptyState
          title="Packing is switched off"
          detail="This module is not enabled for your shop."
        />
      </>
    );
  }

  if (creating) {
    const valid = materialId && skuId && Number(packets) > 0 && Number(consumed) > 0 && !impossible;
    return (
      <>
        <Header title={t('packer.newRun')} />
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
          <Choice
            label={t('stock.bulk')}
            value={materialId}
            onChange={(v) => {
              setMaterialId(v);
              setSkuId('');
            }}
            options={(materials.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
          />
          {materialId ? (
            <Choice
              label={t('catalog.skus')}
              value={skuId}
              onChange={setSkuId}
              options={(skus.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />
          ) : null}
          <NumberField
            label={t('packer.fromBulk')}
            hint="In grams, including anything spilled"
            value={consumed}
            onChangeText={setConsumed}
          />
          <NumberField
            label={t('packer.packetsMade')}
            value={packets}
            onChangeText={setPackets}
          />

          {sku && packets && consumed ? (
            <Card>
              <Text variant="secondary" tone="muted">
                {t('packer.wastage')}
              </Text>
              <Text variant="numeric" tone={impossible ? 'danger' : 'default'}>
                {formatRawQty(wastage)}
              </Text>
              {/* Derived, never entered. See the header comment. */}
              <Text variant="meta" tone="muted">
                {t('packer.wastageNote')}
              </Text>
              {impossible ? (
                <Text variant="secondary" tone="danger">
                  {packets} packets of {formatRawQty(sku.pack_size_base)} need{' '}
                  {formatRawQty(packedBase)}, which is more bulk than you entered.
                </Text>
              ) : null}
            </Card>
          ) : null}

          {error ? (
            <Text variant="secondary" tone="danger">
              {error}
            </Text>
          ) : null}
        </ScrollView>
        <ActionBar>
          <Button
            label={t('common.save')}
            onPress={submit}
            loading={create.isPending}
            disabled={!valid}
          />
          <Button label={t('common.cancel')} kind="ghost" onPress={() => setCreating(false)} />
        </ActionBar>
      </>
    );
  }

  return (
    <>
      <Header title={t('packer.runs')} back={false} />
      {runs.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={runs.data?.rows ?? []}
          keyExtractor={(r) => r.id}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={
            <EmptyState
              title="No packing yet"
              detail="Record a run and the packets will appear in stock."
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.packed_sku_name}
              subtitle={`${item.raw_material_name} · ${formatDate(item.run_on)}`}
              right={
                <>
                  <Qty value={item.packets_produced} kind="PACKED" />
                  {item.wastage_base > 0 ? (
                    <Text variant="meta" tone="muted">
                      {t('packer.wastage')} {formatRawQty(item.wastage_base)}
                    </Text>
                  ) : null}
                </>
              }
            />
          )}
        />
      )}
      <ActionBar>
        <Button label={t('packer.newRun')} onPress={() => setCreating(true)} />
      </ActionBar>
    </>
  );
}
