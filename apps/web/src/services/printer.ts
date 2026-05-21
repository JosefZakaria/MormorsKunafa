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
  xml += `<text align="left" em="false">`;
  if (name) xml += `${escapeXml(name)}&#10;`;
  if (d?.address) xml += `${escapeXml(d.address)}&#10;`;
  if (postalCity) xml += `${escapeXml(postalCity)}&#10;`;
  if (phone) xml += `Tel: ${escapeXml(phone)}&#10;`;
  if (email) xml += `${escapeXml(email)}&#10;`;
  if (!order.scheduledTime) {
    xml += `Leverans: 1-2 arbetsdagar&#10;`;
  }
  xml += `</text>`;
  xml += `<text>--------------------------------&#10;</text>`;
  return xml;
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
        resolve({ success: false, error: 'Timeout — skrivaren svarade inte inom 15 sekunder.' });
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

  // Header
  xml += `<text align="center" dw="true" dh="true" em="true">KOKSLAPP&#10;</text>`;
  xml += `<text align="center" dw="false" dh="false" em="false">${escapeXml(new Date().toLocaleString('sv-SE'))}&#10;</text>`;
  xml += `<feed unit="24"/>`;

  // Order info
  xml += `<text align="left" em="true">Order: #${escapeXml(order.orderNumber || order.id)}&#10;</text>`;
  const custName = deliveryCustomerName(order);
  if (custName && order.orderType !== 'delivery') {
    xml += `<text align="left" em="true">Kund: ${escapeXml(custName)}&#10;</text>`;
  }
  xml += `<text align="left" em="false">Typ: ${escapeXml(ORDER_TYPE_LABELS[order.orderType] || order.orderType)}&#10;</text>`;

  if (order.estimatedReadyTime) {
    const ready = new Date(order.estimatedReadyTime);
    const timeStr = ready.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    xml += `<text align="left">Fardig: ${escapeXml(timeStr)}&#10;</text>`;
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
  xml += `<text align="center" dw="true" dh="true" em="true">Mormors Kunafa&#10;</text>`;
  xml += `<text align="center" dw="false" dh="false" em="false">Order-Kvitto&#10;</text>`;
  xml += `<text align="center">${escapeXml(new Date().toLocaleString('sv-SE'))}&#10;</text>`;
  xml += `<feed unit="24"/>`;

  // Order info
  xml += `<text align="left">Order: #${escapeXml(order.orderNumber || order.id)}&#10;</text>`;
  xml += `<text align="left">Typ: ${escapeXml(ORDER_TYPE_LABELS[order.orderType] || order.orderType)}&#10;</text>`;
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
  xml += `<text align="left" em="true">${totalLeft}${' '.repeat(totalPadding)}${totalRight}&#10;</text>`;
  xml += `<text em="false"/>`;
  xml += `<feed unit="24"/>`;

  // Footer
  xml += `<text align="center">Tack for din bestallning!&#10;</text>`;
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
  const printXml = buildEposPrintXml('');
  const soap = wrapInSoap(printXml);
  return sendToPrinter(soap);
}
