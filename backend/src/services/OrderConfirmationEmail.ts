import { Resend } from 'resend';
import type { Row } from '../db/connection.js';
import { formatStockholmDateTime } from '../utils/stockholmWallTime.js';

/** Same asset as `apps/web/public/images/logo.png` (must resolve to an absolute public URL in email). */
const ORDER_EMAIL_LOGO_PUBLIC_PATH = '/images/logo.png';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSekFromOre(ore: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(ore / 100);
}

function orderTypeLabelSv(orderType: string): string {
  switch (orderType) {
    case 'delivery':
      return 'Leverans';
    case 'eat-here':
      return 'Äta här';
    case 'takeaway':
      return 'Ta med';
    default:
      return orderType;
  }
}

/**
 * Logo `<img src>` needs an absolute, publicly reachable URL (often HTTPS). Set
 * `SITE_PUBLIC_URL=https://example.se` so the resolved URL is `{base}/images/logo.png`.
 * Without a domain, set `ORDER_EMAIL_LOGO_URL` to a direct image link (temporary host).
 */
function logoUrl(): string | undefined {
  const explicit = process.env.ORDER_EMAIL_LOGO_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.SITE_PUBLIC_URL?.trim().replace(/\/$/, '');
  if (base) return `${base}${ORDER_EMAIL_LOGO_PUBLIC_PATH}`;
  return undefined;
}

function parseModifications(raw: Row['modifications_json']): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? p.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export type OrderConfirmationRowContext = {
  order: Row;
  items: Row[];
};

/** Fire-and-forget from order router; logs errors, never throws. */
export async function sendOrderConfirmationEmail(ctx: OrderConfirmationRowContext): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return;

  const to = String(ctx.order.customer_email ?? '').trim();
  if (!to || !isValidEmail(to)) return;

  const from = process.env.RESEND_FROM_EMAIL?.trim() || 'onboarding@resend.dev';
  const customerName = String(ctx.order.customer_name ?? '').trim();
  const orderNumber = String(ctx.order.order_number ?? '');
  const orderType = orderTypeLabelSv(String(ctx.order.order_type ?? ''));
  const totalOre = Number(ctx.order.total_ore) || 0;
  const imgSrc = logoUrl();

  // Förenklad faktura (kvitto): priserna inkluderar moms, så momsen räknas ut baklänges.
  const VAT_RATE = 6;
  const vatOre = Math.round((totalOre * VAT_RATE) / (100 + VAT_RATE));

  // Kvittodatum: tidpunkten då köpet genomfördes.
  const createdAtRaw = ctx.order.created_at as Date | string | null | undefined;
  let receiptDateSv = '';
  if (createdAtRaw != null) {
    const d = createdAtRaw instanceof Date ? createdAtRaw : new Date(createdAtRaw);
    if (!Number.isNaN(d.getTime())) {
      receiptDateSv = new Intl.DateTimeFormat('sv-SE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Stockholm',
      }).format(d);
    }
  }

  // Planerat datum/tid om angivet.
  const scheduledAtRaw = ctx.order.scheduled_at as Date | string | null | undefined;
  const scheduledAtSv = scheduledAtRaw ? formatStockholmDateTime(scheduledAtRaw) : '';
  const isDelivery = String(ctx.order.order_type ?? '') === 'delivery';
  const scheduleTypeLabel = isDelivery ? 'Planerad leveranstid' : 'Planerad upphämtning';

  const rowsHtml = ctx.items.map((item) => {
    const qty = Number(item.quantity) || 0;
    const unitOre = Number(item.price_ore) || 0;
    const lineOre = qty * unitOre;
    const name = escapeHtml(String(item.product_name_snapshot ?? ''));
    const mods = parseModifications(item.modifications_json);
    const modsLine =
      mods.length > 0
        ? `<div style="font-size:13px;color:#6b5f52;margin-top:4px">${escapeHtml(mods.join(', '))}</div>`
        : '';
    return `<tr>
  <td style="padding:12px 0;border-bottom:1px solid #e8e3db">
    <div style="font-weight:600;color:#1A3D32">${name}</div>
    ${modsLine}
    <div style="font-size:13px;color:#555;margin-top:4px">${qty} × ${formatSekFromOre(unitOre)}</div>
  </td>
  <td style="padding:12px 0;border-bottom:1px solid #e8e3db;text-align:right;white-space:nowrap;font-weight:600;color:#1A3D32">${formatSekFromOre(lineOre)}</td>
</tr>`;
  });

  const greeting = customerName ? `Hej ${escapeHtml(customerName)},` : 'Hej,';
  const logoBlock = imgSrc
    ? `<div style="text-align:center;margin-bottom:28px"><img src="${escapeHtml(imgSrc)}" alt="Mormors Kunafa" width="160" height="auto" style="max-width:220px;height:auto;display:inline-block"/></div>`
    : `<div style="text-align:center;margin-bottom:20px;font-size:26px;font-weight:800;color:#1A3D32;letter-spacing:0.5px">Mormors Kunafa</div>`;

  const html = `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width"/>
  <title>Orderbekräftelse ${escapeHtml(orderNumber)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eae6df;font-family:Georgia,'Times New Roman',serif;color:#2C2C2C;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#FBF7F0;border-radius:16px;padding:36px 28px 28px;border:1px solid #ded8cf;box-shadow:0 12px 32px rgba(26,61,50,0.08)">
      ${logoBlock}
      <p style="margin:0 0 14px;line-height:1.55">${greeting}</p>
      <p style="margin:0 0 10px;line-height:1.55">Tack för att du har beställt hos Mormors Kunafa, vi är glada att kunna laga lite gott åt dig.</p>
      <p style="margin:12px 0;color:#555;font-size:15px;line-height:1.5">Vi har tagit emot din beställning <strong>${escapeHtml(orderNumber)}</strong>.</p>
      <p style="margin:4px 0 8px;line-height:1.5"><strong>Typ:</strong> ${escapeHtml(orderType)}</p>
      ${receiptDateSv ? `<p style="margin:4px 0 8px;line-height:1.5"><strong>Kvittodatum:</strong> ${escapeHtml(receiptDateSv)} (svensk tid)</p>` : ''}

      ${scheduledAtSv ? `
      <div style="background-color:#FFF5EE;border:1px solid #FFD39B;border-radius:8px;padding:16px;margin:20px 0;line-height:1.6">
        <strong style="color:#C17E61;font-size:14px">${escapeHtml(scheduleTypeLabel)}:</strong><br/>
        <span style="font-size:18px;color:#1A3D32"><strong>${escapeHtml(scheduledAtSv)}</strong></span>
        <br/>
        <span style="font-size:13px;color:#666">Observera: Din beställning förbereds till denna tidpunkt.</span>
      </div>
      ` : ''}

      <h2 style="font-size:16px;color:#C17E61;text-transform:uppercase;letter-spacing:1px;margin:32px 0 12px">Din order</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
        <tbody>${rowsHtml.join('\n')}
        </tbody>
        <tbody>
          <tr>
            <td style="padding-top:18px;font-size:17px;color:#1A3D32"><strong>Totalt</strong></td>
            <td style="padding-top:18px;text-align:right;font-size:17px;color:#1A3D32"><strong>${formatSekFromOre(totalOre)}</strong></td>
          </tr>
          <tr>
            <td style="padding-top:6px;font-size:13px;color:#555">Varav ${VAT_RATE}% moms</td>
            <td style="padding-top:6px;text-align:right;font-size:13px;color:#555">${formatSekFromOre(vatOre)}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin:32px 0 8px;line-height:1.6;font-size:14px;color:#555">Har du frågor om din order? Återkom till oss med ditt ordernummer så hjälper vi dig gärna.</p>
      <p style="margin:0;line-height:1.6;color:#1A3D32;font-weight:600">Vi ses snart!</p>
      <p style="margin:22px 0 0;line-height:1.5;color:#888;font-size:12px">Med vänliga hälsningar,<br/>Mormors Kunafa</p>
      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e8e3db;line-height:1.6;color:#999;font-size:11px">
        Mormors Kunafa Aktiebolag<br/>
        Organisationsnummer: 559424-4823<br/>
        Karolingatan 1, 212 34 Malmö
      </p>
    </div>
  </div>
</body>
</html>`.trim();

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: `Tack för din beställning ${orderNumber} – Mormors Kunafa`,
    html,
  });

  if (error) {
    console.error('[order confirmation email] Resend error:', error);
  }
}
