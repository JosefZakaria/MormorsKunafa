const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/services/printer.ts');
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function printerService(outcome) {
  const storage = new Map(), requests = [], logs = [];
  class Printer {
    open(_method, url) { this.url = url; }
    setRequestHeader() {}
    send(body) {
      requests.push({ url: this.url, body });
      this.readyState = 4;
      this.status = outcome === 'http' ? 503 : outcome === 'success' ? 200 : 0;
      this.responseXML = { getElementsByTagName: () => [{ getAttribute: () => 'true' }] };
      // Browsers report DONE/status 0 before the network error, timeout or abort event.
      this.onreadystatechange();
      if (outcome === 'network') this.onerror();
      if (outcome === 'timeout') this.ontimeout();
      if (outcome === 'abort') this.onabort?.();
    }
  }
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, XMLHttpRequest: Printer,
    console: { warn: (...args) => logs.push(args) },
    require: name => name.includes('deliveryPricing') ? { showOrderDeliveryEstimate: () => false } : { HOJA_LOCATION_ID: 'hoja-id', MOLLEVANGEN_LOCATION_ID: 'mollan-id' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  }, { filename });
  exports.setPrinterConfig('192.168.1.50', 'local_printer', 'mollevangen');
  return { service: exports, requests, logs };
}

for (const [outcome, expected] of [
  ['network', /Kunde inte nå skrivaren.*Möllevången.*192\.168\.1\.50/],
  ['timeout', /Timeout/],
  ['abort', /avbröts/],
  ['http', /HTTP-fel 503/],
]) {
  test(`printer ${outcome} reports the actual failure instead of HTTP 0`, async () => {
    const { service, requests, logs } = printerService(outcome);
    const result = await service.testConnection('mollevangen');
    assert.equal(result.success, false);
    assert.match(result.error, expected);
    assert.doesNotMatch(result.error, /HTTP-fel 0/);
    assert.equal(requests.length, 1);
    assert.equal(logs.length, 1);
  });
}

test('successful printer response keeps the existing endpoint and sends one print', async () => {
  const { service, requests, logs } = printerService('success');
  const result = await service.testConnection('mollevangen');
  assert.equal(result.success, true);
  assert.equal(requests[0].url, 'http://192.168.1.50/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000');
  assert.equal(requests.length, 1);
  assert.equal(logs.length, 0);
});
