// The ping: a few short notes made with WebAudio (chime, ping or pop, at the chosen volume), so there are no audio files to ship. The
// audio context is made on first use; browsers keep it suspended until the user has touched the
// page, so a blocked chime is dropped quietly and the context wakes on the next gesture.
export const CHIME_GAP_MS = 1500;
/** Messages that arrive in the first moments after start are the backlog, not news. */
export const CHIME_WARMUP_MS = 2000;

import type { Sound } from '../../settings';

/** The notes of each sound: frequency (Hz), start (s), length (s), wave. */
export const SOUNDS: Record<Sound, { freq: number; at: number; len: number; wave: OscillatorType }[]> = {
  chime: [
    { freq: 880, at: 0, len: 0.13, wave: 'sine' },
    { freq: 1320, at: 0.12, len: 0.13, wave: 'sine' },
  ],
  ping: [{ freq: 1568, at: 0, len: 0.18, wave: 'sine' }],
  pop: [
    { freq: 520, at: 0, len: 0.06, wave: 'triangle' },
    { freq: 780, at: 0.05, len: 0.07, wave: 'triangle' },
  ],
};

/** Peak gain for a volume of 0 to 100; 60 is the earlier fixed level. */
export const gainFor = (volume: number) => Math.max(0, Math.min(100, volume)) * 0.0025;

type AudioWindow = Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

export class Chime {
  private audio: AudioContext | null = null;
  private last = -Infinity;
  private unlock = () => {
    try {
      void this.audio?.resume().catch(() => {});
    } catch {
      /* ignored */
    }
  };

  constructor(
    private doc: Document,
    private now: () => number,
    private sound: Sound = 'chime',
    private volume = 60,
  ) {
    for (const e of ['pointerdown', 'keydown']) doc.addEventListener(e, this.unlock, { passive: true });
  }

  /** Plays the chime unless one just played. Never throws. */
  play() {
    const t = this.now();
    if (t - this.last < CHIME_GAP_MS || this.volume <= 0) return;
    this.last = t;
    try {
      const win = this.doc.defaultView as AudioWindow | null;
      const Ctor = win?.AudioContext ?? win?.webkitAudioContext;
      if (!Ctor) return;
      this.audio ??= new Ctor();
      const ctx = this.audio;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const start = ctx.currentTime;
      const peak = gainFor(this.volume);
      for (const note of SOUNDS[this.sound]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = start + note.at;
        osc.type = note.wave;
        osc.frequency.value = note.freq;
        gain.gain.setValueAtTime(peak, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + note.len);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + note.len);
      }
    } catch {
      /* no audio here; the highlight still shows */
    }
  }

  close() {
    for (const e of ['pointerdown', 'keydown']) this.doc.removeEventListener(e, this.unlock);
    try {
      void this.audio?.close().catch(() => {});
    } catch {
      /* ignored */
    }
    this.audio = null;
  }
}
