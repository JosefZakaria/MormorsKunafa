import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import { EventEmitter } from 'node:events';

export function installSyntheticSwish() {
  const original = { request:https.request, read:fs.readFileSync, exists:fs.existsSync };
  const cert='synthetic-swish-cert.invalid', key='synthetic-swish-key.invalid';
  Object.assign(process.env,{SWISH_ENV:'test',SWISH_PAYEE_ALIAS:'1231181189',SWISH_CERT_PATH:cert,SWISH_KEY_PATH:key,SWISH_CALLBACK_BASE_URL:'https://callback.example.test'});
  fs.readFileSync = (file,...args) => [cert,key].includes(file) ? Buffer.from('SYNTHETIC-NOT-A-CERTIFICATE') : original.read(file,...args);
  fs.existsSync = file => [cert,key].includes(file) || original.exists(file);
  const payments=new Map(), calls=[], faults={acceptedTimeout:false,getStatus:0};
  https.request = (url,options,callback) => {
    assert.equal(url.origin,'https://mss.cpc.getswish.net','All external HTTPS remains forbidden');
    assert.equal(options.agent.options.rejectUnauthorized,true);
    assert.match(url.pathname,/^\/swish-cpcapi\/api\/v[12]\/paymentrequests\/[0-9A-F]{32}$/);
    const id=url.pathname.split('/').pop(), request=new EventEmitter();
    let body='';
    request.write=chunk=>{body+=chunk;}; request.setTimeout=()=>request;
    request.destroy=error=>{if(error) queueMicrotask(()=>request.emit('error',error)); return request;};
    request.end=()=>queueMicrotask(()=>{
      calls.push({method:options.method,id});
      let status=200, data;
      if(options.method==='PUT') {
        assert(url.pathname.includes('/v2/'));
        if(payments.has(id)) status=422;
        else {
          data={...JSON.parse(body),id,status:'CREATED',paymentRequestToken:'synthetic-token-'+id}; payments.set(id,data);
          status=201;
          if(faults.acceptedTimeout){faults.acceptedTimeout=false;request.destroy(new Error('Synthetic accepted reply timeout'));return;}
        }
      } else {
        assert.equal(options.method,'GET'); assert(url.pathname.includes('/v1/'));
        data=payments.get(id); status=faults.getStatus || (data ? 200 : 404);
      }
      const response=new EventEmitter(); response.statusCode=status; response.destroy=()=>{};
      callback(response);
      response.emit('data',Buffer.from(JSON.stringify(status>=400 ? {error:'synthetic provider detail'} : data ?? {})));
      response.emit('end');
    });
    return request;
  };
  return {payments,calls,faults,close(){https.request=original.request;fs.readFileSync=original.read;fs.existsSync=original.exists;}};
}
