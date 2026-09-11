import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const repositoryRoot = new URL('../', import.meta.url);
const mobileRequire = createRequire(new URL('apps/mobile/package.json',repositoryRoot));
const semver = mobileRequire('semver');

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
  expo:'57.0.22',
  'expo-constants':'57.0.18',
  'expo-font':'57.0.4',
  'expo-linear-gradient':'57.0.2',
  'expo-linking':'57.0.10',
  'expo-router':'57.0.21',
  'expo-splash-screen':'57.0.9',
  'expo-status-bar':'57.0.1',
  'expo-web-browser':'57.0.3',
  'react-native':'0.86.3',
  react:'19.2.3',
  'react-dom':'19.2.3',
})) {
  assert.equal(packageVersion(name,mobileRequire),version,`${name} must stay on the reviewed Expo SDK 57 patch`);
}

assert.deepEqual(lockedVersions('@react-navigation/native'), [], 'SDK 57 Router owns its navigation fork');

// Native peers can be installed transitively without appearing in the app's
// manifest. Check every locked copy against Expo's own supported matrix.
const nativeMatrix = mobileRequire('expo/bundledNativeModules.json');
for (const [name, supportedRange] of Object.entries(nativeMatrix)) {
  for (const version of lockedVersions(name)) {
    assert.ok(semver.satisfies(version, supportedRange),
      `${name}@${version} must satisfy the installed Expo native matrix ${supportedRange}`);
  }
}

for (const [name, version] of Object.entries({
  react:'19.2.3',
  'react-dom':'19.2.3',
  'react-native':'0.86.3',
  'react-native-reanimated':'4.5.1',
  'react-native-worklets':'0.10.1',
})) {
  assert.deepEqual(
    [...new Set(lockedVersions(name))],
    [version],
    `${name} must remain deduplicated across the workspaces`
  );
}

assert.deepEqual(
  [...new Set(lockedVersions('js-yaml'))].sort(),
  ['4.3.2'],
  'Every installed js-yaml major must include GHSA-2883-xcg3-v3hh fixes'
);

const expoToolRequire = createRequire(new URL('node_modules/@expo/xcpretty/package.json',repositoryRoot));
const yaml = expoToolRequire('js-yaml');
const emptyMergeSources = 'sources: &sources [{},{}]\ntarget:\n  <<: *sources\n';
assert.throws(
  () => yaml.load(emptyMergeSources,{maxTotalMergeKeys:1}),
  /merge keys exceeded maxTotalMergeKeys/,
  'Empty merge sources must consume the configured merge-key budget'
);

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
