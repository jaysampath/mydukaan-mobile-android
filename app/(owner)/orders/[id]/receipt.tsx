import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { useReceipt } from '../../../../src/data/queries';
import { receiptHtml } from '../../../../src/receipt/html';
import {
  ActionBar,
  Button,
  Card,
  Divider,
  Header,
  Loading,
  Money,
  Text,
} from '../../../../src/theme/components';
import { formatDate } from '../../../../src/format/date';
import { formatPackSize } from '../../../../src/format/qty';
import { space } from '../../../../src/theme/tokens';
import { t } from '../../../../src/i18n';

/**
 * The receipt.
 *
 * The server decides what is on it, including whether the GSTIN shows -- that
 * toggle is free on every plan and must never be gated, so the client does not
 * get an opinion about it.
 *
 * Sharing goes through the system share sheet rather than deep-linking to
 * WhatsApp. A file cannot be handed to a specific WhatsApp chat from Expo on
 * Android; the share sheet, with WhatsApp as the user's habitual first icon, is
 * the path that actually works. (A text-only payment reminder CAN deep-link to
 * a chat -- that belongs on the khata screen, not here.)
 */
export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useReceipt(id);
  const [busy, setBusy] = useState(false);

  if (isLoading || !data) return <Loading />;

  const share = async () => {
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: receiptHtml(data) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header
        title={t('orders.receipt')}
        subtitle={data.order.order_no ? t('orders.orderNo', { no: data.order.order_no }) : undefined}
      />

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <Card>
          <Text variant="heading">{data.business.name}</Text>
          {data.business.phone ? (
            <Text variant="secondary" tone="muted">
              {data.business.phone}
            </Text>
          ) : null}
          {/* Null unless the owner switched the toggle on. Server-decided. */}
          {data.business.gstin ? (
            <Text variant="secondary" tone="muted">
              GSTIN: {data.business.gstin}
            </Text>
          ) : null}
        </Card>

        <Card>
          <Text variant="bodyStrong">{data.customer.name}</Text>
          <Text variant="meta" tone="muted">
            {formatDate(data.order.placed_at)}
          </Text>
          <Divider />
          {data.items.map((item, i) => (
            <View
              key={`${item.name}-${i}`}
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text variant="body">
                {item.name} ({formatPackSize(item.pack_size_base)}) × {item.qty_packets}
              </Text>
              <Money value={item.line_total} variant="body" />
            </View>
          ))}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyStrong">{t('orders.total')}</Text>
            <Money value={data.order.total_amount} variant="numeric" />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="secondary" tone="muted">
              {t('orders.paid')}
            </Text>
            <Money value={data.paid} tone="success" />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="secondary" tone="muted">
              {t('orders.balance')}
            </Text>
            <Money value={data.balance} tone={data.balance > 0 ? 'warning' : 'success'} />
          </View>
        </Card>

        {/* Stated on the document itself so it is never mistaken for a tax
            invoice -- which is also why the GSTIN toggle is free forever. */}
        <Text variant="meta" tone="muted" style={{ textAlign: 'center' }}>
          Payment receipt. Not a tax invoice.
        </Text>
      </ScrollView>

      <ActionBar>
        <Button label={t('orders.share')} onPress={share} loading={busy} />
      </ActionBar>
    </>
  );
}
