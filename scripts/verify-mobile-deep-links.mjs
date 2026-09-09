import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const mobileRequire = createRequire(new URL('../apps/mobile/package.json',import.meta.url));
const { parseQueryParams } = mobileRequire('expo-router/build/fork/getStateFromPath-forks');
const route = { name:'eat' };

const valid = parseQueryParams('eat?source=menu',route);
assert.equal(valid?.source,'menu');

const malformed = parseQueryParams(`eat?source=${'%E0%A4%A'.repeat(32)}`,route);
assert.equal(typeof malformed?.source,'string');

console.log('Verified valid and bounded malformed queries through Expo Router\'s inbound link parser.');
