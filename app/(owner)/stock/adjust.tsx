import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { newId } from '../../../src/api/ids';
import { usePackedSkus, useRawMaterials } from '../../../src/data/queries';
import { useAdjustStock } from '../../../src/data/mutations';
import { mapRpcError } from '../../../src/data/errors';
import {
  ActionBar,
  Button,
  Card,
  Choice,
  Header,
  ListRow,
  Loading,
  NumberField,
  PackSize,
  Qty,
  Text,
} from '../../../src/theme/components';
import { space } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

type Mode = 'SET' | 'DELTA';
type Kind = 'RAW' | 'PACKED';

/**
 * Enter or correct stock.
 *
 * This is the screen that makes the app usable at all for a business that
 * already has goods on its shelves. Before `record_stock_adjustment` there was
 * no way to enter an opening balance, so a new shop started at zero and could
 * not dispatch anything.
 *
 * The `SET` / `DELTA` choice is the important bit of design, and the copy
 * carries it rather than the jargon:
 *
 *   "I counted the shelf"  -> SET. The user types what they counted; the server
 *                             works out the signed difference. Nobody should be
 *                             asked to compute "-2" while holding a clipboard.
 *   "Something moved"      -> DELTA. The user knows the movement (3 damaged),
 *                             so that is what we ask for.
 *
 * The screen shows what the app currently thinks and what it will say after
 * saving, so the consequence is visible before the tap.
 */
export default function AdjustStock() {
  const router = useRouter();
  const entryId = useRef(newId()).current;

  const [kind, setKind] = useState<Kind>('PACKED');
  const [itemId, setItemId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('SET');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const materials = useRawMaterials();
  const skus = usePackedSkus();
  const adjust = useAdjustStock();

  const items = kind === 'RAW' ? materials.data ?? [] : skus.data ?? [];
  const chosen = useMemo(
    () => (items as Array<{ id: string }>).find((i) => i.id === itemId),
    [items, itemId],
  );

  const onHand =
    kind === 'RAW'
      ? (chosen as { qty_base?: number } | undefined)?.qty_base ?? 0
      : (chosen as { qty_packets?: number } | undefined)?.qty_packets ?? 0;

  const parsed = Number(qty);
  const valid = qty.trim() !== '' && Number.isFinite(parsed);
  const after = mode === 'SET' ? parsed : onHand + parsed;
  const delta = mode === 'SET' ? parsed - onHand : parsed;

  // No ledger row exists yet for this item, so this is its first count.
  const isFirstCount = onHand === 0;

  const submit = async () => {
    setError(null);
    if (!itemId || !valid) return;
    try {
      const result = await adjust.mutateAsync({
        entryId,
        itemKind: kind,
        itemId,
        mode,
        qty: parsed,
        entryType: isFirstCount && mode === 'SET' ? 'OPENING' : 'ADJUSTMENT',
        note: note.trim() || null,
      });
      if (!result.created && result.delta === 0) {
        // The count agreed with the books. Not an error; say so and stay put.
        setError(t('stock.noChange'));
        return;
      }
      router.back();
    } catch (e) {
      setError(mapRpcError(e).message);
    }
  };

  if (materials.isLoading || skus.isLoading) return <Loading />;

  if (!itemId) {
    return (
      <>
        <Header title={t('stock.adjustTitle')} />
        <View style={{ padding: space.lg }}>
          <Choice
            value={kind}
            onChange={(k) => {
              setKind(k);
              setItemId(null);
            }}
            options={[
              { value: 'PACKED', label: t('stock.packed') },
              { value: 'RAW', label: t('stock.bulk') },
            ]}
          />
        </View>
        <ScrollView>
          {kind === 'RAW'
            ? (materials.data ?? []).map((m) => (
                <ListRow
                  key={m.id}
                  title={m.name}
                  onPress={() => setItemId(m.id)}
                  right={<Qty value={m.qty_base} kind="RAW" baseUnit={m.base_unit} />}
                />
              ))
            : (skus.data ?? []).map((s) => (
                <ListRow
                  key={s.id}
                  title={s.name}
                  subtitle={s.raw_material_name}
                  onPress={() => setItemId(s.id)}
                  right={<Qty value={s.qty_packets} kind="PACKED" />}
                />
              ))}
        </ScrollView>
      </>
    );
  }

  const name = (chosen as { name?: string } | undefined)?.name ?? '';

  return (
    <>
      <Header title={t('stock.adjustTitle')} subtitle={name} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card>
          <Text variant="secondary" tone="muted">
            {t('stock.onHandNow')}
          </Text>
          <Qty
            value={onHand}
            kind={kind}
            baseUnit={
              kind === 'RAW'
                ? ((chosen as { base_unit?: 'g' | 'ml' | 'pcs' } | undefined)?.base_unit ?? 'g')
                : 'g'
            }
            variant="numeric"
          />
          {kind === 'PACKED' && chosen ? (
            <PackSize value={(chosen as { pack_size_base?: number }).pack_size_base} />
          ) : null}
        </Card>

        <Choice
          label={undefined}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'SET', label: t('stock.modeSet') },
            { value: 'DELTA', label: t('stock.modeDelta') },
          ]}
        />

        <NumberField
          label={mode === 'SET' ? t('stock.countedLabel') : t('stock.movementLabel')}
          hint={
            kind === 'RAW'
              ? 'In grams'
              : mode === 'DELTA'
                ? 'Use a minus sign for stock that left'
                : 'Whole packets'
          }
          value={qty}
          onChangeText={setQty}
          keyboardType={mode === 'DELTA' ? 'numbers-and-punctuation' : 'numeric'}
        />

        {valid ? (
          <Card>
            <Text variant="secondary" tone="muted">
              {t('stock.willBecome')}
            </Text>
            <Qty
              value={after}
              kind={kind}
              baseUnit={
                kind === 'RAW'
                  ? ((chosen as { base_unit?: 'g' | 'ml' | 'pcs' } | undefined)?.base_unit ?? 'g')
                  : 'g'
              }
              variant="numeric"
              tone={after < 0 ? 'danger' : 'default'}
            />
            <Text variant="meta" tone="muted">
              {delta >= 0 ? '+' : ''}
              {delta}
            </Text>
            {isFirstCount && mode === 'SET' ? (
              <Text variant="meta" tone="muted">
                {t('stock.opening')}
              </Text>
            ) : null}
          </Card>
        ) : null}

        <NumberField
          label={t('khata.note')}
          keyboardType="default"
          value={note}
          onChangeText={setNote}
        />

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
          loading={adjust.isPending}
          disabled={!valid || after < 0}
        />
      </ActionBar>
    </>
  );
}
