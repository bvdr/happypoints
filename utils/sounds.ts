/**
 * Sound effects for emoji throwing using Web Audio API.
 * Each emoji weapon has a unique synthesized hit sound.
 * Mute preference persisted in localStorage.
 */

const STORAGE_KEY = 'happypoints_sound_muted';

let audioCtx: AudioContext | null = null;
// Guard against SSR — localStorage only available in browser
let muted = typeof localStorage !== 'undefined'
  ? localStorage.getItem(STORAGE_KEY) === 'true'
  : false;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Pre-initialize AudioContext on a user gesture (e.g. first click anywhere).
 * Browsers require a user interaction before allowing audio playback.
 * Call this once from a top-level click handler so subsequent sounds work reliably.
 */
export function initAudioOnGesture(): void {
  getAudioContext();
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem(STORAGE_KEY, String(muted));
  return muted;
}

/** Helper: create a noise buffer with optional fade-out */
function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  return buffer;
}

// --- Individual emoji hit sounds ---

/** Bouncy rubber thud */
function playVolleyball(ctx: AudioContext, now: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

/** Sharp crack/smack */
function playBaseball(ctx: AudioContext, now: number): void {
  // Short noise burst for the crack
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.08);

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.08);

  // Tonal thud underneath
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(500, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.06);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.3, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(gain2).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
}

/** Deep bouncy thump */
function playBasketball(ctx: AudioContext, now: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.45, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}

/** Wet splat */
function playTomato(ctx: AudioContext, now: number): void {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.2);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3000, now);
  filter.frequency.exponentialRampToValueAtTime(300, now + 0.15);
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.45, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.2);
}

/** Low explosion boom */
function playBomb(ctx: AudioContext, now: number): void {
  // Sub bass boom
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(100, now);
  osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.5);

  // Noise layer for explosion texture
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.35);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(5000, now);
  filter.frequency.exponentialRampToValueAtTime(100, now + 0.35);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.35, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  noise.connect(filter).connect(noiseGain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.35);
}

/** Cash register cha-ching */
function playMoney(ctx: AudioContext, now: number): void {
  // Two quick ascending tones
  [0, 0.08].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    const freq = i === 0 ? 1200 : 1600;
    osc.frequency.setValueAtTime(freq, now + offset);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.07);
  });

  // Bell ring
  const bell = ctx.createOscillator();
  bell.type = 'sine';
  bell.frequency.value = 2400;

  const bellGain = ctx.createGain();
  bellGain.gain.setValueAtTime(0.2, now + 0.16);
  bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  bell.connect(bellGain).connect(ctx.destination);
  bell.start(now + 0.16);
  bell.stop(now + 0.5);
}

/** Squelchy splat */
function playPoo(ctx: AudioContext, now: number): void {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.25);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(200, now + 0.2);
  filter.Q.value = 3;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.25);

  // Low squelch undertone
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(250, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.25, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  osc.connect(oscGain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

/** Warm sparkle/chime — ascending notes */
function playHeart(ctx: AudioContext, now: number): void {
  [0, 0.08, 0.16].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const freqs = [523, 659, 784]; // C5, E5, G5 — major chord arpeggio
    osc.frequency.value = freqs[i];

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.25);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.25);
  });
}

/** Sizzle/whoosh */
function playFire(ctx: AudioContext, now: number): void {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.3);

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(1000, now);
  filter.frequency.exponentialRampToValueAtTime(4000, now + 0.3);
  filter.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.linearRampToValueAtTime(0.35, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.3);
}

/** Creamy splat — similar to tomato but softer/lower */
function playPie(ctx: AudioContext, now: number): void {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.25);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, now);
  filter.frequency.exponentialRampToValueAtTime(200, now + 0.2);
  filter.Q.value = 1;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.25);

  // Soft thud
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.2, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(oscGain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

/** Party popper pop */
function playConfetti(ctx: AudioContext, now: number): void {
  // Sharp pop
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.06);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3000;
  filter.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.45, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.06);

  // Sparkle tail — quick descending notes
  [0.04, 0.08, 0.12].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 3000 - i * 600;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, now + offset);
    g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);

    osc.connect(g).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.08);
  });
}

/** Quack */
function playDuck(ctx: AudioContext, now: number): void {
  // Nasal quack — two quick frequency dips on a square wave
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + 0.06);
  osc.frequency.setValueAtTime(550, now + 0.08);
  osc.frequency.exponentialRampToValueAtTime(250, now + 0.16);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 3;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.setValueAtTime(0.3, now + 0.06);
  gain.gain.setValueAtTime(0.001, now + 0.07);
  gain.gain.setValueAtTime(0.3, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

// --- Emoji to sound mapping ---

const emojiSoundMap: Record<string, (ctx: AudioContext, now: number) => void> = {
  '🏐': playVolleyball,
  '⚾': playBaseball,
  '🏀': playBasketball,
  '🍅': playTomato,
  '💣': playBomb,
  '💰': playMoney,
  '💩': playPoo,
  '❤️': playHeart,
  '🔥': playFire,
  '🥧': playPie,
  '🎉': playConfetti,
  '🦆': playDuck,
  '🌹': playHeart, // Rose reuses heart's gentle chime
};

/**
 * Short blip for the round-timer countdown, played once per second over the
 * final seconds before the round auto-reveals. Respects the shared mute flag.
 */
export function playCountdownTick(): void {
  if (muted) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(880, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

/** Play the hit sound matching the given emoji. Falls back to a generic pop. */
export function playHitSound(emoji?: string): void {
  if (muted) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const playFn = emoji ? emojiSoundMap[emoji] : undefined;
  if (playFn) {
    playFn(ctx, now);
  } else {
    // Generic pop fallback
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }
}
