/** Tiny procedural audio engine: ambient pad + UI sound effects, no assets. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambientGain: GainNode | null = null;
let ambientStarted = false;
let muted = false;

const SFX: Record<string, { freq: number[]; dur: number; type: OscillatorType; gain: number; slide?: number }> = {
  click: { freq: [520], dur: 0.06, type: 'sine', gain: 0.05 },
  select: { freq: [660, 880], dur: 0.08, type: 'triangle', gain: 0.04 },
  claim: { freq: [380, 520, 660], dur: 0.16, type: 'triangle', gain: 0.055 },
  build: { freq: [220, 330, 440, 550], dur: 0.24, type: 'sawtooth', gain: 0.035 },
  upgrade: { freq: [440, 660, 880, 1100], dur: 0.3, type: 'triangle', gain: 0.05 },
  error: { freq: [180, 140], dur: 0.16, type: 'square', gain: 0.04 },
  research: { freq: [660, 990, 1320], dur: 0.26, type: 'sine', gain: 0.05 },
  turn: { freq: [392, 523, 659], dur: 0.38, type: 'sine', gain: 0.05 },
  cash: { freq: [880, 1175], dur: 0.12, type: 'sine', gain: 0.04 },
  victory: { freq: [523, 659, 784, 1046, 1318], dur: 1.1, type: 'sine', gain: 0.06 },
};

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  master.connect(ctx.destination);
  startAmbient();
}

function startAmbient() {
  if (!ctx || !master || ambientStarted) return;
  ambientStarted = true;
  ambientGain = ctx.createGain();
  ambientGain.gain.value = 0.035;
  ambientGain.connect(master);
  const chord = [110, 138.59, 164.81, 220];
  chord.forEach((f, i) => {
    const osc = ctx!.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = ctx!.createGain();
    g.gain.value = 0.25;
    const lfo = ctx!.createOscillator();
    lfo.frequency.value = 0.03 + i * 0.017;
    const lfoGain = ctx!.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    const filter = ctx!.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700 + i * 180;
    osc.connect(g);
    g.connect(filter);
    filter.connect(ambientGain!);
    osc.start();
    lfo.start();
  });
}

export function playSfx(name: keyof typeof SFX | string) {
  if (!ctx || !master || muted) return;
  const def = SFX[name];
  if (!def) return;
  const now = ctx.currentTime;
  def.freq.forEach((f, i) => {
    const osc = ctx!.createOscillator();
    const g = ctx!.createGain();
    osc.type = def.type;
    const start = now + i * (def.dur / def.freq.length) * 0.7;
    osc.frequency.setValueAtTime(f, start);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(def.gain, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + def.dur);
    osc.connect(g);
    g.connect(master!);
    osc.start(start);
    osc.stop(start + def.dur + 0.02);
  });
}

export function setMuted(next: boolean) {
  muted = next;
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.7, ctx.currentTime, 0.05);
}

export function isMuted() {
  return muted;
}
