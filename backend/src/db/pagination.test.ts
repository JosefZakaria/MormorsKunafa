import assert from 'node:assert/strict';
import test from 'node:test';
import { collectRowsById } from './pagination.js';

test('reads beyond hosted row caps and preserves distinct items in the same order', async () => {
  const rows = Array.from({ length:1207 }, (_,i)=>({id:String(i).padStart(6,'0'),order_id:'same-order'}));
  let calls=0;
  const result=await collectRowsById(async after=>{
    calls++; return rows.filter(row=>after===undefined || row.id>after).slice(0,73);
  });
  assert.deepEqual(result,rows); assert.equal(calls,18);
});

test('rejects partial reports after later errors, nonadvancing cursors or bounds', async () => {
  await assert.rejects(collectRowsById(async after=>{if(after) throw new Error('later page'); return [{id:'a'}];}),/later page/);
  await assert.rejects(collectRowsById(async()=>[{id:'a'}]),/did not advance/);
  await assert.rejects(collectRowsById(async()=>[{id:'b'},{id:'a'}]),/did not advance/);
  await assert.rejects(collectRowsById(async()=>[{id:null}]),/did not advance/);
  await assert.rejects(collectRowsById(async()=>[{id:'a'},{id:'b'}],{maxPages:2,maxRows:1}),/row limit/);
  await assert.rejects(collectRowsById(async()=>[{id:'a'}],{maxPages:1,maxRows:5}),/page limit/);
});
