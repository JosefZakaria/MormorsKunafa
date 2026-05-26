import type { Order } from '@shared/types';

const PRINTER_IP_KEY = 'printer_ip';
const PRINTER_DEVID_KEY = 'printer_devid';

function getPrinterIp(): string {
  return localStorage.getItem(PRINTER_IP_KEY) || '';
}

function getDeviceId(): string {
  return localStorage.getItem(PRINTER_DEVID_KEY) || 'local_printer';
}

export function setPrinterConfig(ip: string, deviceId?: string) {
  localStorage.setItem(PRINTER_IP_KEY, ip);
  if (deviceId) localStorage.setItem(PRINTER_DEVID_KEY, deviceId);
}

export function getPrinterConfig(): { ip: string; deviceId: string } {
  return { ip: getPrinterIp(), deviceId: getDeviceId() };
}

export function isPrinterConfigured(): boolean {
  return getPrinterIp().length > 0;
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  'eat-here': 'Äta här',
  'takeaway': 'Ta med',
  'delivery': 'Hemleverans',
};

function deliveryCustomerName(order: Order): string {
  return order.customerInfo?.name?.trim() || order.deliveryInfo?.name?.trim() || '';
}

function deliveryPhone(order: Order): string {
  return order.customerInfo?.phone?.trim() || order.deliveryInfo?.phone?.trim() || '';
}

function deliveryEmail(order: Order): string {
  return order.customerInfo?.email?.trim() || order.deliveryInfo?.email?.trim() || '';
}

/** Leveransblock för kökslapp och kvitto (hemleverans). */
function appendDeliveryBlockXml(xml: string, order: Order): string {
  if (order.orderType !== 'delivery') return xml;

  const d = order.deliveryInfo;
  const name = deliveryCustomerName(order);
  const phone = deliveryPhone(order);
  const email = deliveryEmail(order);
  const postalCity = d ? [d.postalCode, d.city].filter(Boolean).join(' ').trim() : '';
  const hasContent = !!(name || phone || email || d?.address || postalCity);

  if (!hasContent) return xml;

  xml += `<feed unit="12"/>`;
  xml += `<text align="left" em="true">Leverans:&#10;</text>`;
  if (name) xml += `<text align="left">${escapeXml(name)}&#10;</text>`;
  if (d?.address) xml += `<text align="left">${escapeXml(d.address)}&#10;</text>`;
  if (postalCity) xml += `<text align="left">${escapeXml(postalCity)}&#10;</text>`;
  if (phone) xml += `<text align="left">Tel: ${escapeXml(phone)}&#10;</text>`;
  if (email) xml += `<text align="left">${escapeXml(email)}&#10;</text>`;
  if (!order.scheduledTime) {
    xml += `<text align="left">Leverans: 1-2 arbetsdagar&#10;</text>`;
  }
  xml += `<text>--------------------------------&#10;</text>`;
  return xml;
}

/** Epson ePOS-Print kräver textinnehåll i varje &lt;text&gt;-element. */
function textLine(content: string, attrs: Record<string, string> = {}): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeXml(v)}"`)
    .join(' ');
  return `<text${attrStr ? ` ${attrStr}` : ''}>${content}&#10;</text>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildEposPrintXml(elements: string): string {
  return `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">${elements}</epos-print>`;
}

function wrapInSoap(printXml: string): string {
  return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">`
    + `<s:Body>${printXml}</s:Body>`
    + `</s:Envelope>`;
}

function buildEndpointUrl(): string {
  const ip = getPrinterIp();
  const devid = getDeviceId();
  return `http://${ip}/cgi-bin/epos/service.cgi?devid=${devid}&timeout=10000`;
}

async function sendToPrinter(soapXml: string): Promise<{ success: boolean; error?: string }> {
  if (!isPrinterConfigured()) {
    return { success: false, error: 'Skrivaren är inte konfigurerad. Ange IP-adress i inställningarna.' };
  }

  try {
    const url = buildEndpointUrl();
    const xhr = new XMLHttpRequest();

    return new Promise((resolve) => {
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'text/xml; charset=utf-8');
      xhr.setRequestHeader('If-Modified-Since', 'Thu, 01 Jan 1970 00:00:00 GMT');
      xhr.setRequestHeader('SOAPAction', '""');
      xhr.timeout = 15000;

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            const res = xhr.responseXML;
            if (res) {
              const responseEl = res.getElementsByTagName('response')[0];
              const successAttr = responseEl?.getAttribute('success');
              if (/^(1|true)$/.test(successAttr || '')) {
                resolve({ success: true });
              } else {
                const code = responseEl?.getAttribute('code') || 'Okänt fel';
                resolve({ success: false, error: `Skrivarfel: ${code}` });
              }
            } else {
              resolve({ success: false, error: 'Tomt svar från skrivaren' });
            }
          } else {
            resolve({ success: false, error: `HTTP-fel ${xhr.status} från skrivaren` });
          }
        }
      };

      xhr.onerror = () => {
        resolve({ success: false, error: 'Kunde inte nå skrivaren. Kontrollera IP och nätverk.' });
      };

      xhr.ontimeout = () => {
        resolve({ success: false, error: 'Timeout - skrivaren svarade inte inom 15 sekunder.' });
      };

      xhr.send(soapXml);
    });
  } catch {
    return { success: false, error: 'Oväntat fel vid utskrift.' };
  }
}

/**
 * Skriver ut en kökslapp (utan priser) — används vid accept.
 */
export async function printKitchenTicket(order: Order): Promise<{ success: boolean; error?: string }> {
  let xml = '';

  // Header (dw/dh="false" är ogiltigt i ePOS-schemat — utelämna attribut för normal storlek)
  xml += textLine('KOKSLAPP', { align: 'center', dw: 'true', dh: 'true', em: 'true' });
  xml += textLine(escapeXml(new Date().toLocaleString('sv-SE')), { align: 'center' });
  xml += `<feed unit="24"/>`;

  // Order info
  xml += textLine(`Order: #${escapeXml(order.orderNumber || order.id)}`, { align: 'left', em: 'true' });
  const custName = deliveryCustomerName(order);
  if (custName && order.orderType !== 'delivery') {
    xml += textLine(`Kund: ${escapeXml(custName)}`, { align: 'left', em: 'true' });
  }
  xml += textLine(`Typ: ${escapeXml(ORDER_TYPE_LABELS[order.orderType] || order.orderType)}`, { align: 'left' });

  if (order.estimatedReadyTime) {
    const ready = new Date(order.estimatedReadyTime);
    const timeStr = ready.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    xml += textLine(`Fardig: ${escapeXml(timeStr)}`, { align: 'left' });
  }

  // Separator
  xml += `<text>--------------------------------&#10;</text>`;

  // Items (no prices)
  if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      xml += `<text align="left">${item.quantity || 1}x ${escapeXml(item.productName || 'Okand produkt')}&#10;</text>`;
      if (item.modifications && item.modifications.length > 0) {
        for (const mod of item.modifications) {
          xml += `<text align="left">   - ${escapeXml(mod)}&#10;</text>`;
        }
      }
    }
  }

  // Separator
  xml += `<text>--------------------------------&#10;</text>`;

  xml = appendDeliveryBlockXml(xml, order);

  xml += `<feed unit="24"/>`;
  xml += `<cut type="feed"/>`;
  xml += `<sound pattern="1" repeat="1"/>`;

  const printXml = buildEposPrintXml(xml);
  const soap = wrapInSoap(printXml);
  return sendToPrinter(soap);
}

/**
 * Skriver ut ett kundkvitto (med priser) — används vid manuell "Kvitto"-knapptryckning.
 */
export async function printReceipt(order: Order): Promise<{ success: boolean; error?: string }> {
  let xml = '';

  // Header
  xml += textLine('Mormors Kunafa', { align: 'center', dw: 'true', dh: 'true', em: 'true' });
  xml += textLine('Order-Kvitto', { align: 'center' });
  xml += textLine(escapeXml(new Date().toLocaleString('sv-SE')), { align: 'center' });
  xml += `<feed unit="24"/>`;

  // Order info
  xml += textLine(`Order: #${escapeXml(order.orderNumber || order.id)}`, { align: 'left' });
  xml += textLine(`Typ: ${escapeXml(ORDER_TYPE_LABELS[order.orderType] || order.orderType)}`, { align: 'left' });
  xml = appendDeliveryBlockXml(xml, order);
  if (order.orderType !== 'delivery') {
    xml += `<text>--------------------------------&#10;</text>`;
  }

  // Items with prices
  if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      const qty = item.quantity || 1;
      const name = item.productName || 'Okand produkt';
      const lineTotal = ((item.price * qty) / 100).toFixed(2);
      const leftStr = `${qty}x ${name}`;
      const rightStr = `${lineTotal} kr`;
      const padding = Math.max(1, 32 - leftStr.length - rightStr.length);
      xml += `<text align="left">${escapeXml(leftStr)}${' '.repeat(padding)}${escapeXml(rightStr)}&#10;</text>`;
      if (item.modifications && item.modifications.length > 0) {
        for (const mod of item.modifications) {
          xml += `<text align="left">   - ${escapeXml(mod)}&#10;</text>`;
        }
      }
    }
  }

  // Total
  xml += `<text>--------------------------------&#10;</text>`;
  const total = ((order.totalPrice || 0) / 100).toFixed(2);
  const totalLeft = 'Totalt:';
  const totalRight = `${total} kr`;
  const totalPadding = Math.max(1, 32 - totalLeft.length - totalRight.length);
  xml += textLine(`${totalLeft}${' '.repeat(totalPadding)}${totalRight}`, { align: 'left', em: 'true' });
  xml += `<feed unit="24"/>`;

  // Footer
  xml += textLine('Tack for din bestallning!', { align: 'center' });
  xml += `<feed unit="48"/>`;
  xml += `<cut type="feed"/>`;
  xml += `<sound pattern="1" repeat="1"/>`;

  const printXml = buildEposPrintXml(xml);
  const soap = wrapInSoap(printXml);
  return sendToPrinter(soap);
}

/**
 * Testar anslutningen genom att skicka tom utskriftsdata.
 */
export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  const xml = textLine('Testutskrift OK', { align: 'center' }) + `<feed unit="24"/><cut type="feed"/>`;
  const printXml = buildEposPrintXml(xml);
  const soap = wrapInSoap(printXml);
  return sendToPrinter(soap);
}
