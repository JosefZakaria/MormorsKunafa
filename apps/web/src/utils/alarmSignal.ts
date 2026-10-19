/** A local, peak-normalized kitchen alarm. No download is needed to start it. */
export const ALARM_PEAK = 0.95;
export const ALARM_SOUND_SECONDS = 2;
export const ALARM_PAUSE_SECONDS = 7;
export const ALARM_CYCLE_SECONDS = ALARM_SOUND_SECONDS + ALARM_PAUSE_SECONDS;

export function createAlarmSamples(sampleRate: number): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * ALARM_CYCLE_SECONDS));
  const soundingSamples = Math.round(sampleRate * ALARM_SOUND_SECONDS);
  const toneSeconds = 0.25;
  const soundingSeconds = 0.235;
  const fadeSeconds = 0.004;
  let peak = 0;

  // The remaining samples stay silent. Web Audio loops both phases together,
  // so queue refreshes and recovery checks cannot shorten the seven-second pause.
  for (let i = 0; i < soundingSamples; i += 1) {
    const time = i / sampleRate;
    const slot = Math.floor(time / toneSeconds);
    const localTime = time - slot * toneSeconds;
    if (localTime >= soundingSeconds) continue;

    // Alternating midrange tones with harmonics. Short fades prevent clicks.
    const frequency = slot % 2 === 0 ? 950 : 1450;
    const phase = 2 * Math.PI * frequency * localTime;
    const envelope = Math.min(1, localTime / fadeSeconds, (soundingSeconds - localTime) / fadeSeconds);
    const third = frequency * 3 < sampleRate / 2 ? Math.sin(phase * 3) / 3 : 0;
    const fifth = frequency * 5 < sampleRate / 2 ? Math.sin(phase * 5) / 5 : 0;
    const value = (Math.sin(phase) + third + fifth) * envelope;
    samples[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }

  for (let i = 0; i < soundingSamples; i += 1) {
    samples[i] *= ALARM_PEAK / peak;
  }
  return samples;
}

export function normalizeAlarmVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.max(0.8, Math.min(1, volume)) : 1;
}
