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
  const buildKitchenXml = (compatMode: boolean): string => {
    let xml = '';

    // Header
    if (compatMode) {
      xml += `<text>Mormors Kunafa&#10;</text>`;
      xml += `<text>KOKSLAPP&#10;</text>`;
    } else {
      xml += `<text align="center" dw="true" dh="true" em="true">Mormors Kunafa&#10;</text>`;
      xml += `<text align="center" dw="true" dh="true" em="true">KOKSLAPP&#10;</text>`;
    }
    xml += `<text>${escapeXml(new Date().toLocaleString('sv-SE'))}&#10;</text>`;
    xml += `<feed unit="24"/>`;

    // Order info
    if (compatMode) {
      xml += `<text>Order: #${escapeXml(order.orderNumber || order.id)}&#10;</text>`;
      xml += `<text>Typ: ${escapeXml(ORDER_TYPE_LABELS[order.orderType] || order.orderType)}&#10;</text>`;
    } else {
      xml += `<text align="left" em="true">Order: #${escapeXml(order.orderNumber || order.id)}&#10;</text>`;
      xml += `<text align="left" em="false">Typ: ${escapeXml(ORDER_TYPE_LABELS[order.orderType] || order.orderType)}&#10;</text>`;
    }

    if (order.estimatedReadyTime) {
      const ready = new Date(order.estimatedReadyTime);
      const timeStr = ready.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
      xml += `<text>Fardig: ${escapeXml(timeStr)}&#10;</text>`;
    }

    // Separator
    xml += `<text>--------------------------------&#10;</text>`;

    // Items (no prices)
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        xml += `<text>${item.quantity || 1}x ${escapeXml(item.productName || 'Okand produkt')}&#10;</text>`;
        if (item.modifications && item.modifications.length > 0) {
          for (const mod of item.modifications) {
            xml += `<text>   - ${escapeXml(mod)}&#10;</text>`;
          }
        }
      }
    }

    // Separator
    xml += `<text>--------------------------------&#10;</text>`;

    // Delivery info
    if (order.orderType === 'delivery' && order.deliveryInfo) {
      xml += `<feed unit="12"/>`;
      xml += `<text>Leveransinfo:&#10;</text>`;
      if (order.deliveryInfo.address) xml += `<text>${escapeXml(order.deliveryInfo.address)}&#10;</text>`;
      const postalCity = [order.deliveryInfo.postalCode, order.deliveryInfo.city].filter(Boolean).join(' ');
      if (postalCity) xml += `<text>${escapeXml(postalCity)}&#10;</text>`;
      if (order.deliveryInfo.phone) xml += `<text>Tel: ${escapeXml(order.deliveryInfo.phone)}&#10;</text>`;
      xml += `<text>--------------------------------&#10;</text>`;
    }

    xml += `<feed unit="24"/>`;
    xml += `<cut type="feed"/>`;
    if (!compatMode) {
      xml += `<sound pattern="1" repeat="1"/>`;
    }
    return xml;
  };

  const primarySoap = wrapInSoap(buildEposPrintXml(buildKitchenXml(false)));
  const primaryResult = await sendToPrinter(primarySoap);
  if (primaryResult.success) {
    return primaryResult;
  }

  if (primaryResult.error?.includes('SchemaError')) {
    const fallbackSoap = wrapInSoap(buildEposPrintXml(buildKitchenXml(true)));
    return sendToPrinter(fallbackSoap);
  }

  return primaryResult;
}

/**
 * Skriver ut ett kundkvitto (med priser) — används vid manuell "Kvitto"-knapptryckning.
 */
export async function printReceipt(order: Order): Promise<{ success: boolean; error?: string }> {
  const buildReceiptXml = (compatMode: boolean): string => {
    let xml = '';

    // Header
    if (compatMode) {
      xml += `<text>Mormors Kunafa&#10;</text>`;
      xml += `<text>Order-Kvitto&#10;</text>`;
    } else {
      xml += `<text align="center" dw="true" dh="true" em="true">Mormors Kunafa&#10;</text>`;
      xml += `<text align="center" dw="false" dh="false" em="false">Order-Kvitto&#10;</text>`;
    }
    xml += `<text>${escapeXml(new Date().toLocaleString('sv-SE'))}&#10;</text>`;
    xml += `<feed unit="24"/>`;

    // Order info
    xml += `<text>Order: #${escapeXml(order.orderNumber || order.id)}&#10;</text>`;
    xml += `<text>--------------------------------&#10;</text>`;

    // Items with prices
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        const qty = item.quantity || 1;
        const name = item.productName || 'Okand produkt';
        const lineTotal = ((item.price * qty) / 100).toFixed(2);
        const leftStr = `${qty}x ${name}`;
        const rightStr = `${lineTotal} kr`;
        const padding = Math.max(1, 32 - leftStr.length - rightStr.length);
        xml += `<text>${escapeXml(leftStr)}${' '.repeat(padding)}${escapeXml(rightStr)}&#10;</text>`;
        if (item.modifications && item.modifications.length > 0) {
          for (const mod of item.modifications) {
            xml += `<text>   - ${escapeXml(mod)}&#10;</text>`;
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
    if (compatMode) {
      xml += `<text>${totalLeft}${' '.repeat(totalPadding)}${totalRight}&#10;</text>`;
    } else {
      xml += `<text align="left" em="true">${totalLeft}${' '.repeat(totalPadding)}${totalRight}&#10;</text>`;
    }
    xml += `<feed unit="24"/>`;

    // Footer
    xml += `<text>Tack for din bestallning!&#10;</text>`;
    xml += `<feed unit="48"/>`;
    xml += `<cut type="feed"/>`;

    // Some Epson firmwares reject <sound> and/or styled <text> tags with SchemaError.
    if (!compatMode) {
      xml += `<sound pattern="1" repeat="1"/>`;
    }

    return xml;
  };

  const primarySoap = wrapInSoap(buildEposPrintXml(buildReceiptXml(false)));
  const primaryResult = await sendToPrinter(primarySoap);
  if (primaryResult.success) {
    return primaryResult;
  }

  if (primaryResult.error?.includes('SchemaError')) {
    const fallbackSoap = wrapInSoap(buildEposPrintXml(buildReceiptXml(true)));
    return sendToPrinter(fallbackSoap);
  }

  return primaryResult;
}

/**
 * Testar anslutningen genom att skicka tom utskriftsdata.
 */
export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  const printXml = buildEposPrintXml('');
  const soap = wrapInSoap(printXml);
  return sendToPrinter(soap);
}
