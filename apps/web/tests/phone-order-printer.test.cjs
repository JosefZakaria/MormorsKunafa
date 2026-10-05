const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('phone order prints to the selected printer with unpaid amount and customer details', async () => {
  const filename = path.resolve(__dirname, '../src/services/printer.ts');
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const prints = [], storage = new Map();
  class Printer {
    open(_method, url) { this.url = url; }
    setRequestHeader() {}
    send(body) {
      prints.push({ url: this.url, body });
      this.readyState = 4; this.status = 200;
      this.responseXML = { getElementsByTagName: () => [{ getAttribute: () => 'true' }] };
      this.onreadystatechange();
    }
  }
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, XMLHttpRequest: Printer,
    require: name => name.includes('deliveryPricing') ? { showOrderDeliveryEstimate: () => false } : { HOJA_LOCATION_ID: 'hoja-id', MOLLEVANGEN_LOCATION_ID: 'mollan-id' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  }, { filename });
  exports.setPrinterConfig('127.0.0.1:9999', 'test', 'mollevangen');
  const order = { id: 'test', orderNumber: '#1001', orderType: 'takeaway', locationId: 'mollan-id', paymentMethod: 'pay_at_pickup', paymentStatus: 'pending', totalPrice: 10000,
    customerInfo: { name: 'Anna Andersson', phone: '0701234567', email: 'anna@example.test' },
    internalNotes: 'Utan sirap', items: [{ productName: 'Kunafa (250 gram)', quantity: 2, price: 5000 }] };
  assert.equal((await exports.printKitchenTicket(order, 'mollevangen')).success, true);
  assert.match(prints[0].url, /127\.0\.0\.1:9999/);
  for (const detail of ['Telefonbestallning', 'Betalas vid hamtning: 100.00 kr', 'Anna Andersson', '0701234567', 'anna@example.test', 'Utan sirap', '2x Kunafa']) assert.ok(prints[0].body.includes(detail));
  await exports.printReceipt(order, 'mollevangen');
  assert.match(prints[1].body, /OBETALD/);
  await exports.printReceipt({ ...order, paymentStatus: 'paid' }, 'mollevangen');
  assert.match(prints[2].body, /Betald i lokalen/);
  assert.doesNotMatch(prints[2].body, /OBETALD/);
  await exports.printKitchenTicket({ ...order, paymentStatus: 'paid' }, 'mollevangen');
  assert.match(prints[3].body, /Betald i lokalen: 100.00 kr/);
  assert.doesNotMatch(prints[3].body, /Betalas vid hamtning/);
  await exports.printKitchenTicket({ ...order, customerInfo: undefined }, 'mollevangen');
  assert.match(prints[4].body, /Telefonbestallning/);
  assert.match(prints[4].body, /Betalas vid hamtning: 100.00 kr/);
  assert.match(prints[4].body, /2x Kunafa/);
  assert.doesNotMatch(prints[4].body, /Kund:|Tel:|E-post:/);
});
