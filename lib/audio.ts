// ---------------------------------------------------------------------------
// Original generated sound effects via the Web Audio API. No external assets.
// Tones are short and soft; everything degrades gracefully when unavailable.
// ---------------------------------------------------------------------------

type SoundName =
  | "move"
  | "spawn"
  | "partial"
  | "pair"
  | "pung"
  | "run"
  | "dragon"
  | "mahj"
  | "gameover"
  | "target";

let ctx: AudioContext | null = null;
let enabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function setAudioEnabled(on: boolean) {
  enabled = on;
}

/** Must be called from a user gesture to unlock audio on iOS. */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

function tone(
  c: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType,
  peak: number,
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const t = c.currentTime;

  switch (name) {
    case "move":
      tone(c, 220, t, 0.08, "sine", 0.05);
      break;
    case "spawn":
      // A soft two-tone "drop" — distinct from any combine click.
      tone(c, 392, t, 0.06, "sine", 0.05);
      tone(c, 261.63, t + 0.05, 0.09, "sine", 0.05);
      break;
    case "partial":
      // A single mid note — "started, not finished".
      tone(c, 466.16, t, 0.1, "triangle", 0.09);
      break;
    case "pair":
      tone(c, 523.25, t, 0.12, "triangle", 0.12); // ceramic click
      break;
    case "pung":
      tone(c, 349.23, t, 0.16, "triangle", 0.14); // deeper
      tone(c, 174.61, t, 0.16, "sine", 0.08);
      break;
    case "run":
      tone(c, 440, t, 0.1, "triangle", 0.1);
      tone(c, 554.37, t + 0.09, 0.1, "triangle", 0.1);
      tone(c, 659.25, t + 0.18, 0.14, "triangle", 0.11);
      break;
    case "dragon":
      tone(c, 146.83, t, 0.28, "sawtooth", 0.09);
      tone(c, 220, t + 0.04, 0.22, "sine", 0.08);
      break;
    case "target":
      tone(c, 587.33, t, 0.1, "sine", 0.09);
      tone(c, 880, t + 0.06, 0.14, "sine", 0.09);
      break;
    case "mahj": {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => tone(c, f, t + i * 0.12, 0.22, "triangle", 0.13));
      break;
    }
    case "gameover":
      tone(c, 293.66, t, 0.3, "sine", 0.1);
      tone(c, 196, t + 0.14, 0.4, "sine", 0.1);
      break;
  }
}
