import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { newId } from '../../../src/api/ids';
import { useMe } from '../../../src/auth/context';
import { usePackedSkus, useRawMaterials, useSuppliers } from '../../../src/data/queries';
import { useAdjustStock, useCreatePurchase } from '../../../src/data/mutations';
import { mapRpcError } from '../../../src/data/errors';
import {
  ActionBar,
  Button,
  Card,
  Choice,
  Field,
  Gap,
  Header,
  IconBadge,
  ListRow,
  Loading,
  NumberField,
  PackSize,
  Qty,
  Select,
  Text,
} from '../../../src/theme/components';
import { unitCostPerBase } from '../../../src/format/money';
import { bulkInputToBase, bulkInputUnit, formatQty, type BaseUnit } from '../../../src/format/qty';
import { space } from '../../../src/theme/tokens';
import { t } from '../../../src/i18n';

type Mode = 'RECEIVED' | 'SET' | 'DELTA';
type Kind = 'RAW' | 'PACKED';

/**
 * Enter or correct stock.
 *
 * This is the screen that makes the app usable at all for a business that
 * already has goods on its shelves. Before `record_stock_adjustment` there was
 * no way to enter an opening balance, so a new shop started at zero and could
 * not dispatch anything.
 *
 * Three modes, and the copy carries them rather than the jargon:
 *
 *   "New stock arrived"    -> a delivery came in. For bulk this is a PURCHASE
 *                             (create_purchase, received at once), not an
 *                             adjustment, so the history says "bought" rather
 *                             than "corrected" and the bill amount is kept.
 *                             Packets are not bought -- they are made from bulk
 *                             -- so for packets this sends you to a packing run
 *                             when the shop packs, and otherwise records a
 *                             plain positive entry.
 *   "I counted the shelf"  -> SET. The user types what they counted; the server
 *                             works out the signed difference. Nobody should be
 *                             asked to compute "-2" while holding a clipboard.
 *   "Something moved"      -> DELTA. The user knows the movement (3 damaged),
 *                             so that is what we ask for.
 *
 * Bulk is typed in kg, not grams: nobody weighs a 25 kg bag and types 25000.
 * The conversion is src/format/qty.ts's job, like every factor of 1000 here.
 *
 * The screen shows what the app currently thinks and what it will say after
 * saving, so the consequence is visible before the tap.
 */
export default function AdjustStock() {
  const router = useRouter();
  const me = useMe();

  // Two ids, minted when the screen opens. They are for two different
  // operations, so switching mode after a timed-out save can never make one
  // call look like a retry of the other.
  const entryId = useRef(newId()).current;
  const purchaseId = useRef(newId()).current;

  const [kind, setKind] = useState<Kind>('PACKED');
  const [itemId, setItemId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('SET');
  const [qty, setQty] = useState('');
  const [amount, setAmount] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const materials = useRawMaterials();
  const skus = usePackedSkus();
  const suppliers = useSuppliers(null, kind === 'RAW');
  const adjust = useAdjustStock();
  const purchase = useCreatePurchase();

  const raw = kind === 'RAW' ? materials.data?.find((m) => m.id === itemId) : undefined;
  const sku = kind === 'PACKED' ? skus.data?.find((s) => s.id === itemId) : undefined;
  const baseUnit: BaseUnit = raw?.base_unit ?? 'g';
  const onHand = (kind === 'RAW' ? raw?.qty_base : sku?.qty_packets) ?? 0;

  // Packets arrive by being packed, so where the shop packs, that is the path.
  const packetsViaPacking = kind === 'PACKED' && me.hasPacking && me.can('run_packing');
  const receivingByPurchase = mode === 'RECEIVED' && kind === 'RAW';

  const parsed =
    kind === 'RAW'
      ? bulkInputToBase(qty, baseUnit)
      : qty.trim() !== '' && Number.isFinite(Number(qty))
        ? Number(qty)
        : null;
  const valid = parsed !== null && (mode !== 'RECEIVED' || parsed > 0);
  const q = parsed ?? 0;
  const after = mode === 'SET' ? q : onHand + q;
  const delta = mode === 'SET' ? q - onHand : q;

  // No ledger row exists yet for this item, so a count is its first count.
  const isFirstCount = onHand === 0;

  const pick = (id: string, currentQty: number) => {
    setItemId(id);
    setQty('');
    setError(null);
    // A first count is the opening balance; otherwise the usual reason to be
    // here is a delivery.
    setMode(currentQty === 0 ? 'SET' : 'RECEIVED');
  };

  const submit = async () => {
    setError(null);
    if (!itemId || !valid || parsed === null) return;
    try {
      if (receivingByPurchase) {
        const paid = amount.trim() ? Number(amount.replace(',', '.')) : null;
        const unitCost = unitCostPerBase(paid, parsed);
        await purchase.mutateAsync({
          purchaseId,
          supplierId: supplierId || null,
          items: [
            {
              raw_material_id: itemId,
              qty_base: parsed,
              ...(unitCost !== null ? { unit_cost_base: unitCost } : {}),
            },
          ],
          notes: note.trim() || null,
          receive: true,
        });
        router.back();
        return;
      }

      const result = await adjust.mutateAsync({
        entryId,
        itemKind: kind,
        itemId,
        mode: mode === 'SET' ? 'SET' : 'DELTA',
        qty: parsed,
        entryType: isFirstCount && mode === 'SET' ? 'OPENING' : 'ADJUSTMENT',
        // Packets that arrived ready-made: the note is the only thing that
        // tells this row apart from a correction in the history.
        note: note.trim() || (mode === 'RECEIVED' ? t('stock.receivedNote') : null),
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
        <View style={{ padding: space.lg, paddingBottom: space.sm }}>
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
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm }}>
          {kind === 'RAW'
            ? (materials.data ?? []).map((m, i) => (
                <View key={m.id}>
                  {i > 0 ? <Gap /> : null}
                  <ListRow
                    card
                    leading={<IconBadge name="leaf-outline" />}
                    title={m.name}
                    onPress={() => pick(m.id, m.qty_base)}
                    right={<Qty value={m.qty_base} kind="RAW" baseUnit={m.base_unit} />}
                  />
                </View>
              ))
            : (skus.data ?? []).map((s, i) => (
                <View key={s.id}>
                  {i > 0 ? <Gap /> : null}
                  <ListRow
                    card
                    leading={<IconBadge name="cube-outline" tone="info" />}
                    title={s.name}
                    subtitle={s.raw_material_name}
                    onPress={() => pick(s.id, s.qty_packets)}
                    right={<Qty value={s.qty_packets} kind="PACKED" />}
                  />
                </View>
              ))}
        </ScrollView>
      </>
    );
  }

  const name = (kind === 'RAW' ? raw?.name : sku?.name) ?? '';
  const sendToPacking = mode === 'RECEIVED' && packetsViaPacking;

  const qtyLabel =
    mode === 'SET'
      ? t('stock.countedLabel')
      : mode === 'DELTA'
        ? t('stock.movementLabel')
        : t('stock.receivedLabel');
  const qtyHint =
    kind === 'RAW'
      ? [
          t('stock.hintInUnit', { unit: bulkInputUnit(baseUnit) }),
          mode === 'DELTA' ? t('stock.hintMinus') : null,
        ]
          .filter(Boolean)
          .join('. ')
      : mode === 'DELTA'
        ? t('stock.hintMinus')
        : t('stock.hintWholePackets');

  const supplierOptions = (suppliers.data?.rows ?? []).map((s) => ({
    value: s.id,
    label: s.name,
    detail: s.phone ?? undefined,
  }));

  return (
    <>
      <Header title={t('stock.adjustTitle')} subtitle={name} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Text variant="secondary" tone="muted">
            {t('stock.onHandNow')}
          </Text>
          <Qty value={onHand} kind={kind} baseUnit={baseUnit} variant="numeric" />
          {sku ? <PackSize value={sku.pack_size_base} /> : null}
        </Card>

        <Choice
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: 'RECEIVED', label: t('stock.modeReceived') },
            { value: 'SET', label: t('stock.modeSet') },
            { value: 'DELTA', label: t('stock.modeDelta') },
          ]}
        />

        {sendToPacking ? (
          <Card>
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
              <IconBadge name="layers-outline" />
              <Text variant="body" style={{ flex: 1 }}>
                {t('stock.packetsFromPacking')}
              </Text>
            </View>
            <Button
              label={t('stock.goToPacking')}
              icon="layers-outline"
              onPress={() => router.push({ pathname: '/(pack)/runs', params: { new: '1' } })}
            />
          </Card>
        ) : (
          <>
            <NumberField
              label={qtyLabel}
              hint={qtyHint}
              value={qty}
              onChangeText={setQty}
              keyboardType={
                mode === 'DELTA'
                  ? 'numbers-and-punctuation'
                  : kind === 'RAW'
                    ? 'decimal-pad'
                    : 'number-pad'
              }
            />

            {receivingByPurchase ? (
              <>
                <NumberField
                  label={t('stock.amountPaid')}
                  hint={t('stock.amountPaidHint')}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
                {/* There is no supplier screen yet, so most shops have none.
                    An empty dropdown would only be a dead end. */}
                {supplierOptions.length > 0 ? (
                  <Select
                    label={t('stock.supplier')}
                    value={supplierId}
                    onChange={setSupplierId}
                    options={supplierOptions}
                  />
                ) : null}
              </>
            ) : null}

            {valid ? (
              <Card>
                <Text variant="secondary" tone="muted">
                  {t('stock.willBecome')}
                </Text>
                <Qty
                  value={after}
                  kind={kind}
                  baseUnit={baseUnit}
                  variant="numeric"
                  tone={after < 0 ? 'danger' : 'default'}
                />
                <Text variant="meta" tone={delta < 0 ? 'danger' : 'success'}>
                  {delta >= 0 ? '+' : ''}
                  {formatQty(delta, kind, baseUnit)}
                </Text>
                {isFirstCount && mode === 'SET' ? (
                  <Text variant="meta" tone="muted">
                    {t('stock.opening')}
                  </Text>
                ) : null}
              </Card>
            ) : null}

            <Field label={t('khata.note')} value={note} onChangeText={setNote} />
          </>
        )}

        {error ? (
          <Text variant="secondary" tone="danger">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      {sendToPacking ? null : (
        <ActionBar>
          <Button
            label={t('common.save')}
            icon="checkmark"
            onPress={submit}
            loading={adjust.isPending || purchase.isPending}
            disabled={!valid || after < 0}
          />
        </ActionBar>
      )}
    </>
  );
}
