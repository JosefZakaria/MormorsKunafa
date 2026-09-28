const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function setup(seed = {}) {
  const storage = new Map(Object.entries(seed)), sent = [], cache = new Map();
  const localStorage = { getItem:k=>storage.get(k)??null, setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k) };
  class XMLHttpRequest {
    open(_method,url) { this.url=url; }
    setRequestHeader() {}
    send(body) { sent.push({url:this.url,body}); this.readyState=4; this.status=200;
      this.responseXML={getElementsByTagName:()=>[{getAttribute:()=> 'true'}]}; this.onreadystatechange(); }
  }
  function load(filename) {
    filename=filename.replace(/\.js$/,'.ts');
    if(!path.extname(filename))filename+='.ts';
    if(cache.has(filename))return cache.get(filename);
    const exports={}; cache.set(filename,exports);
    const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports,localStorage,XMLHttpRequest,console,URL,Date,
      require:specifier=>load(specifier.startsWith('@shared/')
        ? path.resolve(__dirname,'../../..','shared',specifier.slice(8)==='types'?'types/index':specifier.slice(8))
        : path.resolve(path.dirname(filename),specifier))},{filename});
    return exports;
  }
  return {printer:load(path.resolve(__dirname,'../src/services/printer.ts')),storage,sent};
}

test('printer configuration preserves and isolates both stores while migrating legacy values',()=>{
  const {printer:p,storage}=setup({printer_ip:'192.168.1.10',printer_ip_mollevangen:'192.168.2.20'});
  assert.equal(p.getPrinterIp('hoja'),'192.168.1.10');
  assert.equal(p.getPrinterIp('mollevangen'),'192.168.2.20');
  assert.equal(JSON.parse(storage.get('printer_ip_mollevangen')).value,'192.168.2.20');
  p.setPrinterConfig('192.168.2.21','mollan','mollevangen');
  assert.equal(p.getPrinterIp('hoja'),'192.168.1.10');
  assert.equal(p.getDeviceId('mollevangen'),'mollan');
  assert.throws(()=>p.setPrinterConfig('attacker.invalid','x','hoja'));
  assert.throws(()=>p.setPrinterConfig('192.168.1.1','x&payload=1','hoja'));
});
test('an unconfigured second store never inherits the first store printer',()=>{
  const {printer:p}=setup({printer_ip:'192.168.1.10'});
  assert.equal(p.isPrinterConfigured('mollevangen'),false);
  assert.equal(p.getPrinterIp('mollevangen'),'');
});
test('receipt transport routes by store and preserves frozen delivery timing and safe XML',async()=>{
  const {printer:p,sent}=setup();
  p.setPrinterConfig('192.168.2.20','mollan','mollevangen');
  const order={id:'synthetic',orderNumber:'#1',orderType:'delivery',status:'ny',paymentMethod:'card',paymentStatus:'paid',
    totalPrice:10000,createdAt:'2026-09-28T12:00:00Z',items:[],
    customerInfo:{name:'<script>\u001b',phone:'0700000000'},
    deliveryInfo:{address:'Test',postalCode:'22222',city:'Lund',pricing:{feeOre:0,matchedCity:'Lund',showDeliveryEstimate:false}}};
  assert.equal((await p.printReceipt(order,'mollevangen')).success,true);
  assert.match(sent[0].url,/192\.168\.2\.20/);
  assert(!sent[0].body.includes('Leverans: 1-2'));
  assert(!sent[0].body.includes('<script>'));
  assert(!sent[0].body.includes('\u001b'));
  delete order.deliveryInfo.pricing;
  await p.printReceipt(order,'hoja');
  assert.match(sent[1].url,/192\.168\.1\.100/);
  assert(sent[1].body.includes('Leverans: 1-2'));
});
