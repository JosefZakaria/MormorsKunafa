const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadModule(name, globals, cache = new Map()) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.resolve(__dirname, '../src/utils', `${name}.ts`);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  cache.set(name, exports);
  vm.runInNewContext(code, {
    exports, console, Float32Array, ...globals,
    require: dependency => loadModule(dependency.replace('./', ''), globals, cache),
  }, { filename });
  return exports;
}

function setup() {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const contexts = [];
  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    sampleRate = 48000;
    destination = {};
    sources = [];
    canResume = true;
    resumeCalls = 0;
    listeners = [];
    constructor() { contexts.push(this); }
    addEventListener(_name, listener) { this.listeners.push(listener); }
    setState(state) { this.state = state; this.listeners.forEach(listener => listener()); }
    resume() {
      this.resumeCalls += 1;
      if (!this.canResume) return new Promise(() => {});
      this.setState('running');
      return Promise.resolve();
    }
    createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect() {}, disconnect() {} }; }
    createBuffer() { return { copyToChannel() {} }; }
    createBufferSource() {
      const node = {
        started: false, stopped: false, loop: false, onended: null,
        connect() {}, disconnect() {},
        start() { this.started = true; },
        stop() { this.stopped = true; },
      };
      this.sources.push(node);
      return node;
    }
  }
  const globals = {
    window: { AudioContext: FakeAudioContext },
    setTimeout: (callback, delay) => {
      timers.set(++timerId, { callback, time: now + delay });
      return timerId;
    },
    clearTimeout: id => timers.delete(id),
  };
  return {
    player: loadModule('alarmPlayer', globals), contexts,
    advance: milliseconds => {
      now += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.time <= now) { timers.delete(id); timer.callback(); }
      }
    },
  };
}

test('alarm has high sustained signal level, headroom and short pauses at common sample rates', () => {
  const { createAlarmSamples } = loadModule('alarmSignal', {});
  for (const sampleRate of [22050, 44100, 48000, 96000]) {
    const samples = createAlarmSamples(sampleRate);
    let peak = 0;
    let energy = 0;
    let quietRun = 0;
    let longestQuietRun = 0;
    for (const value of samples) {
      assert.ok(Number.isFinite(value));
      peak = Math.max(peak, Math.abs(value));
      energy += value * value;
      quietRun = Math.abs(value) < 0.001 ? quietRun + 1 : 0;
      longestQuietRun = Math.max(longestQuietRun, quietRun);
    }
    assert.ok(peak > 0.94 && peak < 0.96, `peak ${peak} at ${sampleRate}`);
    assert.ok(Math.sqrt(energy / samples.length) > 0.58, `sustained level at ${sampleRate}`);
    assert.ok(longestQuietRun / sampleRate < 0.15, `long silent gap at ${sampleRate}`);
    assert.equal(samples[0], 0);
    assert.equal(samples.at(-1), 0);
  }
});

test('invalid persisted volume cannot make the alarm silent or clip', () => {
  const { normalizeAlarmVolume } = loadModule('alarmSignal', {});
  for (const value of [NaN, Infinity, -Infinity]) assert.equal(normalizeAlarmVolume(value), 1);
  assert.equal(normalizeAlarmVolume(-1), 0.8);
  assert.equal(normalizeAlarmVolume(6), 1);
});

test('an order arriving during a test keeps ringing after the test deadline', async () => {
  const { player, contexts, advance } = setup();
  await player.testAlarm();
  const source = contexts[0].sources[0];
  player.startOrderAlarm();
  advance(6000);
  assert.equal(source.stopped, false);
  assert.equal(source.loop, true);
  assert.equal(player.getAlarmStatus().playing, true);
  assert.equal(player.getAlarmStatus().testing, false);
  player.stopOrderAlarm();
  assert.equal(source.stopped, true);
});

test('test and stop-test controls cannot silence an existing order alarm', async () => {
  const { player, contexts, advance } = setup();
  player.startOrderAlarm();
  await player.testAlarm();
  player.stopAlarmTest();
  advance(10000);
  assert.equal(contexts[0].sources.length, 1);
  assert.equal(player.getAlarmStatus().playing, true);
});

test('test stops automatically when no order is waiting', async () => {
  const { player, contexts, advance } = setup();
  await player.testAlarm();
  advance(4999);
  assert.equal(player.getAlarmStatus().playing, true);
  advance(1);
  assert.equal(player.getAlarmStatus().playing, false);
  assert.equal(contexts[0].sources[0].stopped, true);
});

test('repeated queue refreshes use one source instead of restarting the alarm', () => {
  const { player, contexts } = setup();
  for (let i = 0; i < 100; i += 1) { player.startOrderAlarm(); player.checkAlarmAudio(); }
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].sources.length, 1);
});

test('suspension is reported and a later user gesture resumes the pending alarm', async () => {
  const { player, contexts } = setup();
  player.startOrderAlarm();
  contexts[0].canResume = false;
  contexts[0].setState('suspended');
  assert.equal(player.getAlarmStatus().playing, false);
  assert.equal(player.getAlarmStatus().audioState, 'suspended');
  contexts[0].canResume = true;
  assert.equal(await player.unlockAudio(), true);
  assert.equal(player.getAlarmStatus().playing, true);
  assert.equal(contexts[0].sources.length, 1);
});

test('a temporary browser interruption recovers automatically when resume is allowed', () => {
  const { player, contexts } = setup();
  player.startOrderAlarm();
  contexts[0].setState('suspended');
  assert.equal(player.getAlarmStatus().playing, true);
  assert.equal(contexts[0].sources.length, 1);
});

test('an autoplay request that stays pending times out without hiding the blocked state', async () => {
  const { player, contexts, advance } = setup();
  await player.unlockAudio();
  contexts[0].canResume = false;
  contexts[0].setState('suspended');
  const result = player.testAlarm();
  advance(1500);
  assert.equal(await result, false);
  assert.equal(player.getAlarmStatus().audioState, 'suspended');
  assert.equal(player.getAlarmStatus().testing, false);
});

test('an order takes over even while a test is waiting for permission', async () => {
  const { player, contexts, advance } = setup();
  await player.unlockAudio();
  contexts[0].canResume = false;
  contexts[0].setState('suspended');
  const testResult = player.testAlarm();
  player.startOrderAlarm();
  advance(1500);
  await testResult;
  contexts[0].canResume = true;
  await player.unlockAudio();
  advance(10000);
  assert.equal(player.getAlarmStatus().playing, true);
  assert.equal(player.getAlarmStatus().testing, false);
});

test('a closed context is recreated and an unexpectedly ended source is repaired', () => {
  const { player, contexts } = setup();
  player.startOrderAlarm();
  contexts[0].setState('closed');
  player.checkAlarmAudio();
  assert.equal(contexts.length, 2);
  assert.equal(player.getAlarmStatus().playing, true);
  contexts[1].sources[0].onended();
  assert.equal(player.getAlarmStatus().playing, false);
  player.checkAlarmAudio();
  assert.equal(player.getAlarmStatus().playing, true);
  assert.equal(contexts[1].sources.length, 2);
});

test('dashboard cleanup stops both alarm and preview', async () => {
  const { player, contexts, advance } = setup();
  await player.testAlarm();
  player.startOrderAlarm();
  player.stopAllAlarmAudio();
  advance(10000);
  assert.equal(player.getAlarmStatus().playing, false);
  assert.ok(contexts[0].sources.every(source => source.stopped));
});
