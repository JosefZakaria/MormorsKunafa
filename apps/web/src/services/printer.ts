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
  'eat-here': 'Ata har',
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Minimal ePOS text — samma stil som fungerande testutskrift (endast align). */
function textLine(content: string, align: 'left' | 'center' | 'right' = 'left'): string {
  return `<text align="${align}">${escapeXml(content)}&#10;</text>`;
}

function separator(): string {
  return textLine('--------------------------------');
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

function appendDeliveryBlock(xml: string, order: Order): string {
  if (order.orderType !== 'delivery') return xml;

  const d = order.deliveryInfo;
  const name = deliveryCustomerName(order);
  const phone = deliveryPhone(order);
  const email = deliveryEmail(order);
  const postalCity = d ? [d.postalCode, d.city].filter(Boolean).join(' ').trim() : '';
  const hasContent = !!(name || phone || email || d?.address || postalCity);

  if (!hasContent) return xml;

  xml += `<feed unit="12"/>`;
  xml += textLine('Leverans:');
  if (name) xml += textLine(name);
  if (d?.address) xml += textLine(d.address);
  if (postalCity) xml += textLine(postalCity);
  if (phone) xml += textLine(`Tel: ${phone}`);
  if (email) xml += textLine(email);
  if (!order.scheduledTime) {
    xml += textLine('Leverans: 1-2 arbetsdagar');
  }
  xml += separator();
  return xml;
}

function finishPrint(xml: string): string {
  return xml + `<feed unit="24"/><cut type="feed"/>`;
}

/**
 * Skriver ut en kökslapp (utan priser) — används vid accept.
 */
export async function printKitchenTicket(order: Order): Promise<{ success: boolean; error?: string }> {
  let xml = '';

  xml += textLine('KOKSLAPP', 'center');
  xml += textLine(new Date().toLocaleString('sv-SE'), 'center');
  xml += `<feed unit="24"/>`;

  xml += textLine(`Order: #${order.orderNumber || order.id}`);
  const custName = deliveryCustomerName(order);
  if (custName && order.orderType !== 'delivery') {
    xml += textLine(`Kund: ${custName}`);
  }
  xml += textLine(`Typ: ${ORDER_TYPE_LABELS[order.orderType] || order.orderType}`);

  if (order.estimatedReadyTime) {
    const ready = new Date(order.estimatedReadyTime);
    const timeStr = ready.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    xml += textLine(`Fardig: ${timeStr}`);
  }

  xml += separator();

  if (order.items?.length) {
    for (const item of order.items) {
      xml += textLine(`${item.quantity || 1}x ${item.productName || 'Okand produkt'}`);
      if (item.modifications?.length) {
        for (const mod of item.modifications) {
          xml += textLine(`   - ${mod}`);
        }
      }
    }
  }

  xml += separator();
  xml = appendDeliveryBlock(xml, order);
  xml = finishPrint(xml);

  return sendToPrinter(wrapInSoap(buildEposPrintXml(xml)));
}

/**
 * Skriver ut ett kundkvitto (med priser) — används vid manuell "Kvitto"-knapptryckning.
 */
export async function printReceipt(order: Order): Promise<{ success: boolean; error?: string }> {
  let xml = '';

  xml += textLine('Mormors Kunafa', 'center');
  xml += textLine('Order-Kvitto', 'center');
  xml += textLine(new Date().toLocaleString('sv-SE'), 'center');
  xml += `<feed unit="24"/>`;

  xml += textLine(`Order: #${order.orderNumber || order.id}`);
  xml += textLine(`Typ: ${ORDER_TYPE_LABELS[order.orderType] || order.orderType}`);
  xml = appendDeliveryBlock(xml, order);
  if (order.orderType !== 'delivery') {
    xml += separator();
  }

  if (order.items?.length) {
    for (const item of order.items) {
      const qty = item.quantity || 1;
      const name = item.productName || 'Okand produkt';
      const lineTotal = (((item.price ?? 0) * qty) / 100).toFixed(2);
      xml += textLine(`${qty}x ${name}`);
      xml += textLine(`   ${lineTotal} kr`);
      if (item.modifications?.length) {
        for (const mod of item.modifications) {
          xml += textLine(`   - ${mod}`);
        }
      }
    }
  }

  xml += separator();
  const total = ((order.totalPrice || 0) / 100).toFixed(2);
  xml += textLine(`Totalt: ${total} kr`);
  xml += `<feed unit="24"/>`;
  xml += textLine('Tack for din bestallning!', 'center');
  xml = finishPrint(xml);

  return sendToPrinter(wrapInSoap(buildEposPrintXml(xml)));
}

/**
 * Testar anslutningen med minimal utskrift (samma XML-stil som kvitto).
 */
export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  const xml = finishPrint(textLine('Testutskrift OK', 'center'));
  return sendToPrinter(wrapInSoap(buildEposPrintXml(xml)));
}
