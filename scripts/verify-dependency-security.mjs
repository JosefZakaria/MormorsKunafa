import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const repositoryRoot = new URL('../', import.meta.url);
const mobileRequire = createRequire(new URL('apps/mobile/package.json',repositoryRoot));

function packageVersion(name,resolver = require) {
  return resolver(`${name}/package.json`).version;
}

const lock = JSON.parse(await readFile(new URL('package-lock.json', repositoryRoot), 'utf8'));
const lockedVersions = name => Object.entries(lock.packages)
  .filter(([location]) => location === `node_modules/${name}` || location.endsWith(`/node_modules/${name}`))
  .map(([, metadata]) => metadata.version);

assert.equal(packageVersion('express'),'5.2.1','Express must stay on the reviewed v5 migration');
assert.equal(packageVersion('body-parser'),'2.3.0','Express must use the reviewed body parser');
assert.equal(packageVersion('qs'),'6.16.0','qs must include both reviewed DoS fixes');
assert.deepEqual([...new Set(lockedVersions('qs'))],['6.16.0']);
assert.equal(packageVersion('undici'),'6.28.1','Expo CLI must use the reviewed undici patch');
assert.deepEqual([...new Set(lockedVersions('undici'))],['6.28.1']);

for (const [name, version] of Object.entries({
  '@react-navigation/native':'7.3.18',
  expo:'54.0.37',
  'expo-constants':'18.0.14',
  'expo-font':'14.0.12',
  'expo-linear-gradient':'15.0.8',
  'expo-linking':'8.0.12',
  'expo-router':'6.0.24',
  'expo-splash-screen':'31.0.13',
  'expo-status-bar':'3.0.9',
  'expo-web-browser':'15.0.11',
  react:'19.1.0',
  'react-dom':'19.1.0',
})) {
  assert.equal(packageVersion(name,mobileRequire),version,`${name} must stay on the reviewed Expo SDK 54 patch`);
}

for (const [name, version] of Object.entries({
  '@react-navigation/native':'7.3.18',
  react:'19.1.0',
  'react-dom':'19.1.0',
})) {
  assert.deepEqual(
    [...new Set(lockedVersions(name))],
    [version],
    `${name} must remain deduplicated across the workspaces`
  );
}

assert.deepEqual(
  [...new Set(lockedVersions('js-yaml'))].sort(),
  ['3.15.2','4.3.2'],
  'Every installed js-yaml major must include GHSA-2883-xcg3-v3hh fixes'
);

const yaml3 = require('js-yaml');
const expoToolRequire = createRequire(new URL('node_modules/@expo/xcpretty/package.json',repositoryRoot));
const yaml4 = expoToolRequire('js-yaml');
const emptyMergeSources = 'sources: &sources [{},{}]\ntarget:\n  <<: *sources\n';
for (const yaml of [yaml3,yaml4]) {
  assert.throws(
    () => yaml.load(emptyMergeSources,{maxTotalMergeKeys:1}),
    /merge keys exceeded maxTotalMergeKeys/,
    'Empty merge sources must consume the configured merge-key budget'
  );
}

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

console.log('Verified reviewed Express, qs, undici, Expo and js-yaml versions plus advisory regressions.');
