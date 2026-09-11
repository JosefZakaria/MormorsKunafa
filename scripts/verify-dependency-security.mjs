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
assert.deepEqual(lockedVersions('undici'), [], 'SDK 55 removed the old Expo CLI undici dependency; review any reintroduction');

for (const [name, version] of Object.entries({
  '@react-navigation/native':'7.3.18',
  expo:'55.0.31',
  'expo-constants':'55.0.17',
  'expo-font':'55.0.8',
  'expo-linear-gradient':'55.0.18',
  'expo-linking':'55.0.17',
  'expo-router':'55.0.18',
  'expo-splash-screen':'55.0.25',
  'expo-status-bar':'55.0.6',
  'expo-web-browser':'55.0.20',
  'react-native':'0.83.10',
  react:'19.2.0',
  'react-dom':'19.2.0',
})) {
  assert.equal(packageVersion(name,mobileRequire),version,`${name} must stay on the reviewed Expo SDK 55 patch`);
}

for (const [name, version] of Object.entries({
  '@react-navigation/native':'7.3.18',
  react:'19.2.0',
  'react-dom':'19.2.0',
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

console.log('Verified reviewed Express, qs, Expo and js-yaml versions, removed undici, and advisory regressions.');
