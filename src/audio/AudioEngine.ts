/**
 * Procedural sound: every effect is synthesised with Web Audio, driven by
 * simulation events (ball speed, contact forces), so no audio assets are needed.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private rollSrc: AudioBufferSourceNode | null = null;
  private ambience: GainNode | null = null;
  private airHum: GainNode | null = null;
  private lastHit = 0;
  private muted = false;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private noiseSource(loop = false) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    s.loopStart = Math.random();
    return s;
  }

  private env(gain: GainNode, t: number, peak: number, attack: number, decay: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, type: OscillatorType, t: number, peak: number, decay: number, dest: AudioNode = this.master) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    this.env(g, t, peak, 0.005, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.05);
    return o;
  }

  ui() {
    if (!this.ctx) return;
    this.tone(880, 'sine', this.ctx.currentTime, 0.05, 0.06);
  }

  /** Arcade-cabinet blips: square-wave notes one after another (coin, life lost, game over). */
  chip(freqs: number[], gap = 0.08) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    freqs.forEach((f, i) => this.tone(f, 'square', t + i * gap, 0.05, gap * 1.4));
  }

  /** Soft footstep in the hall; `hard` floors (wood, tiles) click a little brighter than carpet. */
  step(hard: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = (hard ? 1400 : 500) + Math.random() * 200;
    const g = ctx.createGain();
    this.env(g, t, hard ? 0.09 : 0.05, 0.003, 0.06);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.1);
  }

  /** Ball released: thud on the lane plus the start of the rolling rumble. */
  release() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = this.tone(90, 'sine', t, 0.5, 0.25);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    this.startRoll();
  }

  private startRoll() {
    const ctx = this.ctx!;
    this.stopRoll();
    this.rollSrc = this.noiseSource(true);
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 180;
    this.rollFilter.Q.value = 3;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    this.rollSrc.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
    this.rollSrc.start();
  }

  /** Rumble follows the ball speed (m/s) and fades as it goes away from the camera. */
  updateRoll(speed: number, distance: number) {
    if (!this.ctx || !this.rollGain || !this.rollFilter) return;
    const t = this.ctx.currentTime;
    const v = Math.min(speed / 9, 1.2);
    const fade = 1 / (1 + distance * 0.06);
    this.rollGain.gain.setTargetAtTime(0.55 * v * fade, t, 0.05);
    this.rollFilter.frequency.setTargetAtTime(110 + v * 160, t, 0.05);
  }

  stopRoll() {
    if (!this.rollSrc || !this.ctx) return;
    const src = this.rollSrc;
    this.rollGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    setTimeout(() => src.stop(), 400);
    this.rollSrc = null;
  }

  /** Pin or ball impact; loudness from the contact force reported by the physics. */
  impact(kind: 'ball-pin' | 'pin-pin' | 'pin-lane' | 'ball-wall', force: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.lastHit < 0.012) return;
    this.lastHit = now;
    const level = Math.min(1, Math.log10(1 + force) / 3.2);
    if (level < 0.05) return;
    const t = now + Math.random() * 0.01;

    if (kind === 'ball-wall') {
      this.tone(70, 'sine', t, 0.4 * level, 0.18);
      return;
    }
    // Hollow wooden "clack": filtered noise burst + resonant body tone.
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'pin-lane' ? 900 : 1700 + Math.random() * 900;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    this.env(g, t, 0.9 * level, 0.002, kind === 'ball-pin' ? 0.12 : 0.07);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.2);
    const body = kind === 'ball-pin' ? 380 : 520 + Math.random() * 380;
    this.tone(body, 'triangle', t, 0.35 * level, 0.09);
  }

  /** Big cartoon pin crash for the TV clip: a burst of wooden clacks. */
  crash() {
    if (!this.ctx) return;
    for (let i = 0; i < 9; i++) {
      setTimeout(() => {
        this.lastHit = 0;
        this.impact(i === 0 ? 'ball-pin' : 'pin-pin', 400 + Math.random() * 600);
      }, i * 28 + Math.random() * 20);
    }
  }

  gutter() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(55, 'sine', t, 0.5, 0.35);
    this.tone(110, 'triangle', t + 0.02, 0.15, 0.25);
  }

  /** Short crowd reaction (filtered noise swell). */
  private cheer(amount: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * amount, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 2);
  }

  strike(crowd: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 'triangle', t + i * 0.09, 0.22, 0.35));
    this.tone(1046.5, 'sine', t + 0.36, 0.15, 0.8);
    if (crowd) this.cheer(1);
  }

  spare(crowd: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(659.25, 'triangle', t, 0.2, 0.3);
    this.tone(987.77, 'triangle', t + 0.12, 0.2, 0.5);
    if (crowd) this.cheer(0.6);
  }

  foul() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(220, 'square', t, 0.08, 0.25);
    this.tone(196, 'square', t + 0.25, 0.08, 0.35);
  }

  /** Pinsetter machinery hum + sweep. */
  sweep() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 48;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    const lp = ctx.createBiquadFilter();
    lp.frequency.value = 300;
    o.connect(lp).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1.3);
  }

  // ------------------------------------------------------------------ darts
  /** Plastic tip into the electronic board: a click plus the machine's scoring beep. `level` 0..1.2. */
  dartHit(level: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const src = this.noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.frequency.value = 2600;
    const g = this.ctx.createGain();
    this.env(g, now, 0.7 * level, 0.001, 0.06);
    src.connect(lp).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + 0.1);
    this.tone(180, 'sine', now, 0.4 * level, 0.08);
    this.tone(1480, 'square', now + 0.06, 0.06, 0.09);
  }

  // ------------------------------------------------------------------ air hockey
  /** Plastic clack: mallet on puck is fuller, rail hits thinner. `speed` in m/s. */
  hockeyHit(kind: 'mallet' | 'rail', speed: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.lastHit < 0.03) return;
    this.lastHit = now;
    const level = Math.min(1, speed / 8);
    if (level < 0.04) return;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'mallet' ? 2400 : 3400 + Math.random() * 600;
    bp.Q.value = 2.2;
    const g = ctx.createGain();
    this.env(g, now, 0.8 * level, 0.001, 0.05);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + 0.1);
    this.tone(kind === 'mallet' ? 620 : 1100, 'triangle', now, 0.25 * level, 0.05);
  }

  /** Puck dropping into the goal slot, then the scoring chime. */
  hockeyGoal(mine: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.tone(300, 'sine', t, 0.4, 0.25);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.22);
    const notes = mine ? [523.25, 659.25, 783.99] : [392, 329.63];
    notes.forEach((f, i) => this.tone(f, 'triangle', t + 0.25 + i * 0.1, 0.2, 0.3));
    if (mine) this.cheer(0.5);
  }

  /** Two-tone start buzzer; `end` plays a longer fanfare (win) or a drop (loss). */
  hockeyBuzzer(kind: 'start' | 'win' | 'lose') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'start') {
      this.tone(660, 'square', t, 0.06, 0.12);
      this.tone(880, 'square', t + 0.16, 0.07, 0.25);
    } else if (kind === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 'triangle', t + i * 0.11, 0.22, 0.4));
      this.cheer(1);
    } else {
      [392, 349.23, 293.66].forEach((f, i) => this.tone(f, 'triangle', t + i * 0.16, 0.2, 0.4));
    }
  }

  /** Blower hum of the air table. */
  setAirHum(on: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (on && !this.airHum) {
      const src = this.noiseSource(true);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      this.airHum = ctx.createGain();
      this.airHum.gain.value = 0;
      this.airHum.gain.setTargetAtTime(0.05, ctx.currentTime, 0.4);
      src.connect(lp).connect(this.airHum).connect(this.master);
      src.start();
    } else if (!on && this.airHum) {
      const g = this.airHum;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      setTimeout(() => g.disconnect(), 1200);
      this.airHum = null;
    }
  }

  /** Low murmur of a busy bowling alley. */
  setAmbience(on: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (on && !this.ambience) {
      const src = this.noiseSource(true);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 450;
      bp.Q.value = 0.5;
      this.ambience = ctx.createGain();
      this.ambience.gain.value = 0;
      this.ambience.gain.setTargetAtTime(0.035, ctx.currentTime, 1);
      src.connect(bp).connect(this.ambience).connect(this.master);
      src.start();
    } else if (!on && this.ambience) {
      const g = this.ambience;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      setTimeout(() => g.disconnect(), 1500);
      this.ambience = null;
    }
  }
}

export const audio = new AudioEngine();
