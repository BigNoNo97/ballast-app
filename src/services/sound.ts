// Audio Synthesizer using standard Web Audio API (No external sound files required)
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playTimerWarningBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {
    console.debug('Audio not allowed yet:', e);
  }
}

export function playTimerFinishBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Double chime: 587.33 (D5) -> 880 (A5) -> 1174.66 (D6)
    const notes = [
      { freq: 587.33, start: 0, duration: 0.15 },
      { freq: 880, start: 0.12, duration: 0.18 },
      { freq: 1174.66, start: 0.25, duration: 0.35 },
    ];

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.start);

      gain.gain.setValueAtTime(0.2, ctx.currentTime + n.start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.start + n.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + n.start);
      osc.stop(ctx.currentTime + n.start + n.duration);
    });

    triggerHaptic([100, 50, 150]);
  } catch (e) {
    console.debug('Audio error:', e);
  }
}

export function playWorkoutCompleteSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const chords = [
      { freq: 523.25, time: 0 },   // C5
      { freq: 659.25, time: 0.1 }, // E5
      { freq: 783.99, time: 0.2 }, // G5
      { freq: 1046.5, time: 0.3 }, // C6
    ];

    chords.forEach((c) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(c.freq, ctx.currentTime + c.time);

      gain.gain.setValueAtTime(0.25, ctx.currentTime + c.time);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + c.time + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + c.time);
      osc.stop(ctx.currentTime + c.time + 0.4);
    });

    triggerHaptic([150, 80, 200]);
  } catch (e) {
    console.debug('Audio error:', e);
  }
}

export function triggerHaptic(pattern: number | number[] = 50) {
  try {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    // Ignore unsupported
  }
}
