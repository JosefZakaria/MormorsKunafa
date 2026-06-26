/**
 * Utility to manage and synthesize looping alarm sounds for new orders.
 * Uses Web Audio API to generate synthetic sounds programmatically.
 */

export type AlarmType = 'timer' | 'ring' | 'siren' | 'buzzer';

let audioCtx: AudioContext | null = null;
let mainGainNode: GainNode | null = null;
let currentVolume = 0.8; // Default 80% volume
let isLooping = false;
let loopIntervalId: ReturnType<typeof setInterval> | null = null;
let activeNodes: Array<AudioNode | OscillatorNode | GainNode> = [];

/**
 * Initializes the AudioContext if it hasn't been created yet.
 */
function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
    
    // Create main gain node for volume control
    mainGainNode = audioCtx.createGain();
    mainGainNode.gain.setValueAtTime(currentVolume, audioCtx.currentTime);
    mainGainNode.connect(audioCtx.destination);
  }
  return audioCtx;
}

/**
 * Ensures the AudioContext is resumed (bypasses browser autoplay restrictions).
 * Should be called inside a user interaction handler.
 */
export async function unlockAudio(): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch (err) {
    console.error('Failed to unlock audio context:', err);
    return false;
  }
}

/**
 * Get current audio context state (e.g. 'suspended', 'running', 'closed')
 */
export function getAudioState(): 'suspended' | 'running' | 'closed' | 'not_initialized' {
  if (!audioCtx) return 'not_initialized';
  return audioCtx.state;
}

/**
 * Updates the alarm volume.
 * @param volume Value between 0.8 (minimum) and 1.0 (maximum)
 */
export function setAlarmVolume(volume: number): void {
  currentVolume = Math.max(0.8, Math.min(1, volume));
  if (mainGainNode && audioCtx) {
    mainGainNode.gain.setValueAtTime(currentVolume, audioCtx.currentTime);
  }
}

/**
 * Clears all active oscillators and gain nodes currently playing.
 */
function stopActiveSounds(): void {
  activeNodes.forEach(node => {
    try {
      if ('stop' in node) {
        (node as OscillatorNode).stop();
      }
      node.disconnect();
    } catch {
      // Ignore if already stopped/disconnected
    }
  });
  activeNodes = [];
}

/**
 * Starts playing a repeating alarm loop.
 * @param type The sound pattern to play
 */
export function startAlarm(type: AlarmType): void {
  const ctx = getAudioContext();
  
  // If already playing a loop, stop it first
  if (isLooping) {
    stopAlarm();
  }

  isLooping = true;

  // Make sure context is active
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const playTick = () => {
    if (!isLooping || !audioCtx || !mainGainNode) return;
    
    // Clean up previous interval nodes to prevent memory leak
    stopActiveSounds();
    
    const now = audioCtx.currentTime;

    if (type === 'timer') {
      // --- Kökstimer: Pulsating high-pitched double beeps ---
      // Beep 1
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(980, now);
      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      
      osc1.connect(gain1);
      gain1.connect(mainGainNode);
      osc1.start(now);
      osc1.stop(now + 0.15);
      
      // Beep 2 (150ms later)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(980, now + 0.15);
      gain2.gain.setValueAtTime(0.0001, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.3, now + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.27);
      
      osc2.connect(gain2);
      gain2.connect(mainGainNode);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.3);

      activeNodes.push(osc1, gain1, osc2, gain2);

    } else if (type === 'ring') {
      // --- Ringsignal: Rapidly vibrating dual-tone bell ---
      const duration = 1.0; // Ring duration
      const oscA = audioCtx.createOscillator();
      const oscB = audioCtx.createOscillator();
      const gainRing = audioCtx.createGain();

      oscA.type = 'sine';
      oscA.frequency.setValueAtTime(440, now);
      
      oscB.type = 'sine';
      // Low-frequency oscillator to modulate the pitch, simulating mechanical bell vibration
      oscB.frequency.setValueAtTime(480, now);

      gainRing.gain.setValueAtTime(0.0001, now);
      // Ring pulse envelope
      gainRing.gain.linearRampToValueAtTime(0.25, now + 0.05);
      
      // Rapid volume modulation to simulate bell vibration
      const modSpeed = 0.05; // 20 times per second
      for (let t = 0.05; t < duration; t += modSpeed) {
        gainRing.gain.linearRampToValueAtTime(0.25, now + t);
        gainRing.gain.linearRampToValueAtTime(0.02, now + t + modSpeed / 2);
      }
      gainRing.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscA.connect(gainRing);
      oscB.connect(gainRing);
      gainRing.connect(mainGainNode);

      oscA.start(now);
      oscB.start(now);
      oscA.stop(now + duration + 0.05);
      oscB.stop(now + duration + 0.05);

      activeNodes.push(oscA, oscB, gainRing);

    } else if (type === 'siren') {
      // --- Sirenljud: Sweeping pitch warning ---
      const oscS = audioCtx.createOscillator();
      const gainS = audioCtx.createGain();

      oscS.type = 'triangle';
      oscS.frequency.setValueAtTime(450, now);
      // Sweep pitch up to 850Hz and back down
      oscS.frequency.linearRampToValueAtTime(850, now + 0.4);
      oscS.frequency.linearRampToValueAtTime(450, now + 0.8);

      gainS.gain.setValueAtTime(0.0001, now);
      gainS.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gainS.gain.setValueAtTime(0.2, now + 0.7);
      gainS.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

      oscS.connect(gainS);
      gainS.connect(mainGainNode);

      oscS.start(now);
      oscS.stop(now + 0.85);

      activeNodes.push(oscS, gainS);

    } else if (type === 'buzzer') {
      // --- Intensivt surr: Harsh buzzer pulses ---
      const oscBuzz = audioCtx.createOscillator();
      const gainBuzz = audioCtx.createGain();

      oscBuzz.type = 'sawtooth';
      oscBuzz.frequency.setValueAtTime(150, now);

      gainBuzz.gain.setValueAtTime(0.0001, now);
      gainBuzz.gain.linearRampToValueAtTime(0.18, now + 0.02);
      gainBuzz.gain.setValueAtTime(0.18, now + 0.28);
      gainBuzz.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

      oscBuzz.connect(gainBuzz);
      gainBuzz.connect(mainGainNode);

      oscBuzz.start(now);
      oscBuzz.stop(now + 0.32);

      activeNodes.push(oscBuzz, gainBuzz);
    }
  };

  // Determine interval duration based on pattern type
  let intervalMs = 1000; // Default (timer, siren)
  if (type === 'ring') {
    intervalMs = 2500; // 1s ring + 1.5s pause
  } else if (type === 'buzzer') {
    intervalMs = 500;  // Rapid buzz
  }

  // Play immediately
  playTick();

  // Set interval for looping
  loopIntervalId = setInterval(playTick, intervalMs);
}

/**
 * Stops playing the alarm loop and cleans up active sound nodes.
 */
export function stopAlarm(): void {
  isLooping = false;
  if (loopIntervalId) {
    clearInterval(loopIntervalId);
    loopIntervalId = null;
  }
  stopActiveSounds();
}

/**
 * Checks if the alarm is currently active.
 */
export function isAlarmActive(): boolean {
  return isLooping;
}
