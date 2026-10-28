/** Shared, gesture-unlocked arcade synth. No network requests or audio files. */
let audio: AudioContext | null = null;
let enabled = false;
let lastClick = 0;
let lastCrateTick = -Infinity;
let crateNoise: AudioBuffer | null = null;
const activeVoices = new Set<AudioScheduledSourceNode>();

export function setSoundEnabled(value: boolean) {
  enabled = value;
  if (!value) {
    lastCrateTick = -Infinity;
    for (const voice of activeVoices) { try { voice.stop(); } catch {} }
    activeVoices.clear();
  }
}

export function unlockSound() {
  if (!enabled || typeof window === 'undefined' || typeof window.AudioContext !== 'function') return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
  } catch { audio = null; }
}

const patterns: Record<string, { notes: number[]; type?: OscillatorType; step?: number; duration?: number; volume?: number }> = {
  click: { notes: [740, 980], type: 'sine', step: .025, duration: .065, volume: .025 },
  tick: { notes: [700], type: 'triangle', duration: .04, volume: .018 },
  confirm: { notes: [392, 523, 659], type: 'triangle', step: .06, duration: .16 },
  error: { notes: [180, 130], type: 'triangle', step: .09, duration: .12, volume: .035 },
  xp: { notes: [523, 659, 784, 1047], type: 'triangle', step: .045, duration: .16 },
  workout: { notes: [262, 330, 392, 523, 659, 784, 1047], type: 'triangle', step: .085, duration: .36, volume: .045 },
  level: { notes: [392, 494, 587, 784, 988, 1175, 1568], type: 'triangle', step: .1, duration: .4, volume: .045 },
  crate: { notes: [196, 247, 294, 392, 494], type: 'triangle', step: .08, duration: .2 },
  'crate-land': { notes: [294, 587, 880], type: 'triangle', step: .025, duration: .22, volume: .025 },
  rare: { notes: [523, 659, 784, 1047, 1319, 1568], type: 'sine', step: .09, duration: .45, volume: .045 },
  sell: { notes: [988, 1319, 1568], type: 'sine', step: .05, duration: .15 },
};

function crateTransient(context: AudioContext, intensity: number, landing = false) {
  const start = context.currentTime;
  const duration = landing ? .13 : .028;
  // Reuse a tiny noise buffer: a dry mechanical attack rather than a musical beep.
  if (!crateNoise) {
    crateNoise = context.createBuffer(1, Math.ceil(context.sampleRate * .03), context.sampleRate);
    const samples = crateNoise.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
  }
  const noise = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = crateNoise;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(landing ? 1250 : 1800 + intensity * 600, start);
  filter.Q.setValueAtTime(.8, start);
  noiseGain.gain.setValueAtTime(.0001, start);
  noiseGain.gain.linearRampToValueAtTime((landing ? .045 : .028) * intensity, start + .001);
  noiseGain.gain.exponentialRampToValueAtTime(.0001, start + .024);
  noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(context.destination);
  activeVoices.add(noise);
  noise.onended = () => { activeVoices.delete(noise); noise.disconnect(); filter.disconnect(); noiseGain.disconnect(); };
  noise.start(start); noise.stop(start + .03);

  const body = context.createOscillator();
  const bodyGain = context.createGain();
  body.type = 'triangle';
  body.frequency.setValueAtTime(landing ? 180 : 620 + intensity * 140, start);
  body.frequency.exponentialRampToValueAtTime(landing ? 65 : 280, start + duration);
  bodyGain.gain.setValueAtTime(.0001, start);
  bodyGain.gain.linearRampToValueAtTime((landing ? .065 : .022) * intensity, start + .002);
  bodyGain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  body.connect(bodyGain); bodyGain.connect(context.destination);
  activeVoices.add(body);
  body.onended = () => { activeVoices.delete(body); body.disconnect(); bodyGain.disconnect(); };
  body.start(start); body.stop(start + duration + .003);
}

/** Called at reel crossings; cap the rapid opening roll without queueing delayed ticks. */
export function playCrateTick(intensity = 1) {
  if (!enabled) return;
  unlockSound();
  const context = audio;
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  if (now - lastCrateTick < .032) return;
  lastCrateTick = now;
  const strength = Number.isFinite(intensity) ? Math.max(.3, Math.min(1, intensity)) : 1;
  try { crateTransient(context, strength); } catch { /* Audio never blocks opening a crate. */ }
}

export function playSound(kind: string) {
  if (!enabled) return;
  const now = Date.now();
  if (kind === 'click' && now - lastClick < 55) return;
  if (kind === 'click') lastClick = now;
  unlockSound();
  const context = audio;
  if (!context) return;
  const pattern = patterns[kind] ?? patterns.click;
  // resume() settles after a first user gesture; retry just this sound once.
  const schedule = () => {
    if (!enabled || context.state !== 'running') return;
    try {
      if (kind === 'crate-land') crateTransient(context, 1, true);
      pattern.notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * (pattern.step ?? .065);
        const duration = pattern.duration ?? .18;
        oscillator.type = pattern.type ?? 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(pattern.volume ?? .035, start + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        activeVoices.add(oscillator);
        oscillator.onended = () => { activeVoices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start);
        oscillator.stop(start + duration + .015);
      });
    } catch { /* Browser audio restrictions never interrupt a workout. */ }
  };
  if (context.state === 'running') schedule();
  else void context.resume().then(schedule).catch(() => {});
}
