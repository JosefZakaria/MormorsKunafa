import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const repositoryRoot = new URL('../', import.meta.url);

function packageVersion(name) {
  return require(`${name}/package.json`).version;
}

const lock = JSON.parse(await readFile(new URL('package-lock.json', repositoryRoot), 'utf8'));
const lockedVersions = name => Object.entries(lock.packages)
  .filter(([location]) => location === `node_modules/${name}` || location.endsWith(`/node_modules/${name}`))
  .map(([, metadata]) => metadata.version);

assert.equal(packageVersion('express'),'5.2.1','Express must stay on the reviewed v5 migration');
assert.equal(packageVersion('body-parser'),'2.3.0','Express must use the reviewed body parser');
assert.equal(packageVersion('qs'),'6.16.0','qs must include both reviewed DoS fixes');
assert.deepEqual([...new Set(lockedVersions('qs'))],['6.16.0']);

const qs = require('qs');
assert.throws(
  () => qs.parse('a[]=1,2,3,4',{comma:true,arrayLimit:3,throwOnLimitExceeded:true}),
  RangeError,
  'Bracket-key comma parsing must enforce arrayLimit'
);
const hostile = qs.parse('x%5Bconstructor%5D%5BisBuffer%5D=y',{plainObjects:true});
assert.doesNotThrow(
  () => qs.stringify(hostile),
  'parse/stringify must tolerate an attacker-controlled constructor.isBuffer value'
);

console.log('Verified installed Express/body-parser/qs versions and both qs advisory regressions.');
