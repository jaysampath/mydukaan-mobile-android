import type { Receipt } from '../api/reads';
import { formatMoney } from '../format/money';
import { formatDate } from '../format/date';
import { formatPackSize } from '../format/qty';

/**
 * The printable receipt.
 *
 * Inline styles and no external assets: expo-print renders this string in
 * isolation, so anything it cannot resolve locally simply will not appear.
 *
 * Sized for a phone screenshot as much as for paper -- most of these will be
 * looked at in WhatsApp, not printed.
 */

function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function receiptHtml(r: Receipt): string {
  const rows = r.items
    .map(
      (item) => `
        <tr>
          <td>
            ${escapeHtml(item.name)}
            <div class="muted">${escapeHtml(formatPackSize(item.pack_size_base))} &times; ${item.qty_packets}</div>
          </td>
          <td class="num">${escapeHtml(formatMoney(item.line_total))}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, Roboto, sans-serif; color: #12160F; padding: 24px; }
      h1 { font-size: 22px; margin: 0 0 2px; }
      .muted { color: #55606E; font-size: 13px; }
      .head { border-bottom: 2px solid #12160F; padding-bottom: 12px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      td { padding: 8px 0; border-bottom: 1px solid #E3E6E1; vertical-align: top; font-size: 15px; }
      .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .totals td { border-bottom: none; padding: 4px 0; }
      .grand td { font-weight: 700; font-size: 19px; border-top: 2px solid #12160F; padding-top: 10px; }
      .stamp { margin-top: 28px; text-align: center; color: #55606E; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="head">
      <h1>${escapeHtml(r.business.name)}</h1>
      ${r.business.phone ? `<div class="muted">${escapeHtml(r.business.phone)}</div>` : ''}
      ${r.business.address ? `<div class="muted">${escapeHtml(r.business.address)}</div>` : ''}
      ${/* Present only when the owner switched the toggle on. Free, always. */ ''}
      ${r.business.gstin ? `<div class="muted">GSTIN: ${escapeHtml(r.business.gstin)}</div>` : ''}
    </div>

    <div>
      <strong>${escapeHtml(r.customer.name)}</strong>
      ${r.customer.phone ? `<div class="muted">${escapeHtml(r.customer.phone)}</div>` : ''}
      <div class="muted">
        ${r.order.order_no ? `Order #${r.order.order_no} &middot; ` : ''}${escapeHtml(formatDate(r.order.placed_at))}
      </div>
    </div>

    <table>${rows}</table>

    <table class="totals">
      <tr class="grand"><td>Total</td><td class="num">${escapeHtml(formatMoney(r.order.total_amount))}</td></tr>
      <tr><td class="muted">Paid</td><td class="num">${escapeHtml(formatMoney(r.paid))}</td></tr>
      ${
        r.paid_from_account > 0
          ? `<tr><td class="muted">of which from account</td><td class="num">${escapeHtml(formatMoney(r.paid_from_account))}</td></tr>`
          : ''
      }
      <tr><td class="muted">Balance</td><td class="num">${escapeHtml(formatMoney(r.balance))}</td></tr>
      <tr><td class="muted">Account balance</td><td class="num">${escapeHtml(formatMoney(r.customer_outstanding))}</td></tr>
    </table>

    <div class="stamp">
      Payment receipt &middot; not a tax invoice
    </div>
  </body>
</html>`;
}
