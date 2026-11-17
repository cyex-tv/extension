// The ping: two short sine notes made with WebAudio, so there are no audio files to ship. The
// audio context is made on first use; browsers keep it suspended until the user has touched the
// page, so a blocked chime is dropped quietly and the context wakes on the next gesture.
export const CHIME_GAP_MS = 1500;
/** Messages that arrive in the first moments after start are the backlog, not news. */
export const CHIME_WARMUP_MS = 2000;

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
  ) {
    for (const e of ['pointerdown', 'keydown']) doc.addEventListener(e, this.unlock, { passive: true });
  }

  /** Plays the chime unless one just played. Never throws. */
  play() {
    const t = this.now();
    if (t - this.last < CHIME_GAP_MS) return;
    this.last = t;
    try {
      const win = this.doc.defaultView as AudioWindow | null;
      const Ctor = win?.AudioContext ?? win?.webkitAudioContext;
      if (!Ctor) return;
      this.audio ??= new Ctor();
      const ctx = this.audio;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const start = ctx.currentTime;
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = start + i * 0.12;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.13);
      });
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
