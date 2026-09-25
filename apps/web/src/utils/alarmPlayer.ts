import { createAlarmSamples, normalizeAlarmVolume } from './alarmSignal';

type AudioState = AudioContextState | 'not_initialized' | 'unavailable';
export interface AlarmPlayerStatus {
  audioState: AudioState;
  playing: boolean;
  testing: boolean;
  failed: boolean;
}

let audioCtx: AudioContext | null = null;
let mainGain: GainNode | null = null;
let buffer: AudioBuffer | null = null;
let source: AudioBufferSourceNode | null = null;
let volume = 1;
let orderAlarmRequested = false;
let testing = false;
let failed = false;
let testGeneration = 0;
let testTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
let status: AlarmPlayerStatus = { audioState: 'not_initialized', playing: false, testing: false, failed: false };

function publishStatus(): void {
  const audioState = audioCtx?.state ?? (failed ? 'unavailable' : 'not_initialized');
  const playing = audioState === 'running' && source !== null;
  if (status.audioState === audioState && status.playing === playing && status.testing === testing && status.failed === failed) return;
  status = { audioState, playing, testing, failed };
  listeners.forEach(listener => listener());
}

export const getAlarmStatus = (): AlarmPlayerStatus => status;
export function subscribeAlarmStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function stopSource(): void {
  const previous = source;
  source = null;
  if (previous) {
    previous.onended = null;
    previous.stop();
    previous.disconnect();
  }
}

function getContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    stopSource();
    mainGain?.disconnect();
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is unavailable');
    const ctx = new AudioContextClass();
    audioCtx = ctx;
    mainGain = ctx.createGain();
    mainGain.gain.value = volume;
    mainGain.connect(ctx.destination);
    const samples = createAlarmSamples(ctx.sampleRate);
    buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    ctx.addEventListener('statechange', () => {
      if (audioCtx !== ctx) return;
      if (ctx.state === 'running' && (orderAlarmRequested || testing)) ensurePlaying();
      // Recover an interruption while the order screen is still visible, too.
      // If Chrome requires a fresh gesture, the blocked status remains visible.
      else if (ctx.state !== 'closed' && orderAlarmRequested) void unlockAudio();
      publishStatus();
    });
  }
  return audioCtx;
}

function ensurePlaying(): void {
  if (!orderAlarmRequested && !testing) return;
  try {
    const ctx = getContext();
    if (!source) {
      const next = ctx.createBufferSource();
      next.buffer = buffer;
      next.loop = true;
      next.connect(mainGain!);
      next.onended = () => {
        next.disconnect();
        if (source === next) source = null;
        publishStatus();
      };
      next.start();
      source = next;
    }
    failed = false;
  } catch (error) {
    failed = true;
    console.error('[order-alarm] Could not start audio:', error);
  }
  publishStatus();
}

/** Call directly from a click handler. A blocked resume must not hang the UI. */
export async function unlockAudio(): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const ctx = getContext();
    if (ctx.state !== 'running') {
      await Promise.race([
        ctx.resume(),
        new Promise<void>(resolve => { timeout = setTimeout(resolve, 1500); }),
      ]);
    }
    failed = false;
    ensurePlaying();
    return ctx.state === 'running' && !failed;
  } catch (error) {
    failed = true;
    console.error('[order-alarm] Could not activate audio:', error);
    return false;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    publishStatus();
  }
}

export function setAlarmVolume(nextVolume: number): void {
  volume = normalizeAlarmVolume(nextVolume);
  if (mainGain && audioCtx) mainGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.01);
}

function cancelTestTimer(): void {
  testGeneration += 1;
  if (testTimer !== null) clearTimeout(testTimer);
  testTimer = null;
}

export function startOrderAlarm(): void {
  const wasRequested = orderAlarmRequested;
  orderAlarmRequested = true;
  // Orders invalidate every test callback, even a pending autoplay request.
  cancelTestTimer();
  testing = false;
  ensurePlaying();
  if (!wasRequested) void unlockAudio();
}

export function stopOrderAlarm(): void {
  orderAlarmRequested = false;
  if (!testing) stopSource();
  publishStatus();
}

export function stopAlarmTest(): void {
  cancelTestTimer();
  testing = false;
  if (!orderAlarmRequested) stopSource();
  publishStatus();
}

export async function testAlarm(): Promise<boolean> {
  if (orderAlarmRequested) return unlockAudio();
  cancelTestTimer();
  const generation = testGeneration;
  testing = true;
  ensurePlaying();
  const unlocked = await unlockAudio();
  if (generation !== testGeneration || orderAlarmRequested || !testing) return unlocked;
  if (unlocked) {
    testTimer = setTimeout(stopAlarmTest, 5000);
  } else {
    stopAlarmTest();
  }
  publishStatus();
  return unlocked;
}

/** Repair a missing source, without repeatedly requesting autoplay permission. */
export function checkAlarmAudio(): void {
  if (orderAlarmRequested || testing) ensurePlaying();
  publishStatus();
}

export function recoverAlarmAudio(): void {
  if (audioCtx || orderAlarmRequested || testing) void unlockAudio();
}

export function stopAllAlarmAudio(): void {
  orderAlarmRequested = false;
  stopAlarmTest();
}
