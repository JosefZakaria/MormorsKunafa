import test from 'node:test';
import assert from 'node:assert/strict';

const data = new Map();
globalThis.localStorage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: key => data.delete(key),
};

let sentUrls = [];
let printerSuccess = true;
globalThis.XMLHttpRequest = class {
  readyState = 0;
  status = 200;
  responseXML = {
    getElementsByTagName: () => [{ getAttribute: key => key === 'success' ? String(printerSuccess) : 'ERR' }],
  };
  open(_method, url) { this.url = url; }
  setRequestHeader() {}
  send() {
    sentUrls.push(this.url);
    this.readyState = 4;
    this.onreadystatechange();
  }
};

const printer = await import('../apps/web/src/services/printer.ts');
const state = await import('../apps/web/src/services/kitchenPrintState.ts');
const order = {
  id: 'order-1', orderNumber: 'H1', orderType: 'takeaway',
  locationId: 'hoja', items: [{ quantity: 1, productName: 'Kunafa' }],
};

test('saved Höja printer remains intact, but old default is not verified', () => {
  data.clear();
  data.set('printer_ip', '192.168.1.100');
  data.set('printer_devid', 'local_printer');
  assert.deepEqual(printer.getPrinterConfig('hoja'), { ip: '192.168.1.100', deviceId: 'local_printer' });
  assert.equal(printer.isPrinterConfigured('hoja'), false);
});

test('test print uses typed values without overwriting saved values', async () => {
  data.clear();
  printer.setPrinterConfig('192.168.1.42', 'kitchen', 'hoja');
  sentUrls = [];
  printerSuccess = true;
  const result = await printer.testConnection('hoja', { ip: '192.168.1.43', deviceId: 'trial' });
  assert.equal(result.success, true);
  assert.match(sentUrls[0], /192\.168\.1\.43.*devid=trial/);
  assert.deepEqual(printer.getPrinterConfig('hoja'), { ip: '192.168.1.42', deviceId: 'kitchen' });
  assert.equal(printer.isPrinterConfigured('hoja'), false);
});

test('only verified local printer prints and failures are reported', async () => {
  data.clear();
  sentUrls = [];
  printer.setPrinterConfig('192.168.1.42', 'kitchen', 'hoja');
  assert.equal((await printer.printKitchenTicket(order, 'hoja')).success, false);
  assert.equal(sentUrls.length, 0);
  printer.verifySavedPrinterConfig('hoja');
  printerSuccess = true;
  assert.equal((await printer.printKitchenTicket(order, 'hoja')).success, true);
  printerSuccess = false;
  assert.equal((await printer.printKitchenTicket(order, 'hoja')).success, false);
  assert.equal((await printer.printKitchenTicket(order, 'mollevangen')).success, false);
  assert.equal(sentUrls.length, 2);
  assert.ok(sentUrls.every(url => url.includes('192.168.1.42')));
});

test('tablet remembers printed and uncertain tickets across reads', () => {
  data.clear();
  assert.equal(state.getKitchenPrintStatus('order-1'), null);
  assert.equal(state.setKitchenPrintStatus('order-1', 'printing'), true);
  assert.equal(state.getKitchenPrintStatus('order-1'), 'review');
  assert.equal(state.setKitchenPrintStatus('order-1', 'printed'), true);
  assert.equal(state.getKitchenPrintStatus('order-1'), 'printed');
  assert.equal(state.setKitchenPrintStatus('order-2', 'review'), true);
  assert.equal(state.getKitchenPrintStatus('order-2'), 'review');
});

test('automatic ticket eligibility stays on the designated paid Höja order', () => {
  data.clear();
  printer.setPrinterConfig('192.168.1.42', 'kitchen', 'hoja');
  printer.verifySavedPrinterConfig('hoja');
  const hojaOrder = { ...order, locationId: '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601', paymentStatus: 'paid' };
  const molleOrder = { ...hojaOrder, locationId: '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f602' };
  assert.equal(state.shouldAutoPrintKitchenTicket(hojaOrder, true, true), true);
  assert.equal(state.shouldAutoPrintKitchenTicket(hojaOrder, false, true), false);
  assert.equal(state.shouldAutoPrintKitchenTicket(hojaOrder, true, false), false);
  assert.equal(state.shouldAutoPrintKitchenTicket(molleOrder, true, true), false);
  assert.equal(state.shouldAutoPrintKitchenTicket({ ...hojaOrder, paymentStatus: 'pending' }, true, true), false);
  assert.equal(state.shouldAutoPrintKitchenTicket({ ...hojaOrder, scheduledTime: '2099-01-01T12:00:00Z' }, true, true), false);
  state.setKitchenPrintStatus(hojaOrder.id, 'printed');
  assert.equal(state.shouldAutoPrintKitchenTicket(hojaOrder, true, true), false);
});

test('activation holds older due tickets for manual review but leaves future preorders eligible', () => {
  data.clear();
  printer.setPrinterConfig('192.168.1.42', 'kitchen', 'hoja');
  printer.verifySavedPrinterConfig('hoja');
  const acceptedDue = {
    ...order, id: 'accepted-due', status: 'mottagen', paymentStatus: 'paid',
    locationId: '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601',
    scheduledTime: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
  const futurePreorder = { ...acceptedDue, id: 'future-preorder', scheduledTime: new Date(Date.now() + 24 * 60 * 60_000).toISOString() };
  assert.equal(state.markExistingDueTicketsForReview([acceptedDue, futurePreorder]), true);
  assert.equal(state.getKitchenPrintStatus(acceptedDue.id), 'review');
  assert.equal(state.shouldAutoPrintKitchenTicket(acceptedDue, true, true), false);
  assert.equal(state.getKitchenPrintStatus(futurePreorder.id), null);
  assert.equal(state.shouldAutoPrintKitchenTicket({ ...futurePreorder, scheduledTime: new Date(Date.now() + 5 * 60_000).toISOString() }, true, true), true);
});
