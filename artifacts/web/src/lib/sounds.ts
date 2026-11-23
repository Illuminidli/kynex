import type { Sound } from "@kynex/motion";

/**
 * Session sounds, each with one meaning, so a patient learns them without the voice.
 * They are made in the browser (Web Audio), so there are no sound files and no licences.
 * The options match the sound picker page (docs/previews/sounds.html). The clinic picks a
 * default for each; patients can choose their own on the Settings page (kept on their phone).
 */
type Note = [freq: number, start: number, length: number, wave: OscillatorType, volume: number, slideTo?: number];

const OPTIONS: Record<Sound, Note[][]> = {
  in: [
    [[784, 0, 0.5, "sine", 0.35], [1175, 0.12, 0.7, "sine", 0.3]],
    [[660, 0, 0.25, "triangle", 0.4], [1320, 0.06, 0.6, "sine", 0.18]],
    [[523, 0, 0.4, "sine", 0.3], [659, 0.12, 0.4, "sine", 0.3], [784, 0.24, 0.7, "sine", 0.3]],
  ],
  out: [
    [[784, 0, 0.3, "triangle", 0.4], [523, 0.22, 0.45, "triangle", 0.4]],
    [[330, 0, 0.16, "sine", 0.55], [330, 0.22, 0.16, "sine", 0.55]],
    [[600, 0, 0.7, "sine", 0.35, 450]],
  ],
  form: [
    [[220, 0, 0.12, "square", 0.12], [220, 0.18, 0.12, "square", 0.12]],
    [[180, 0, 0.09, "triangle", 0.6], [150, 0.12, 0.09, "triangle", 0.6]],
    [[294, 0, 0.28, "sawtooth", 0.1, 262]],
  ],
  rep: [[[1320, 0, 0.12, "sine", 0.35]], [[900, 0, 0.09, "sine", 0.45, 500]], [[988, 0, 0.22, "triangle", 0.4]]],
  redo: [
    [[392, 0, 0.18, "triangle", 0.4], [392, 0.24, 0.3, "triangle", 0.4]],
    [[523, 0, 0.18, "sine", 0.4], [392, 0.2, 0.35, "sine", 0.4, 349]],
    [[140, 0, 0.25, "sine", 0.7, 90]],
  ],
  reset: [[[900, 0, 0.35, "sine", 0.3, 300]], [[440, 0, 0.6, "sine", 0.35]], [[700, 0, 0.07, "square", 0.1], [700, 0.11, 0.07, "square", 0.1]]],
  done: [
    [[523, 0, 0.3, "sine", 0.3], [659, 0.1, 0.3, "sine", 0.3], [784, 0.2, 0.3, "sine", 0.3], [1047, 0.3, 0.7, "sine", 0.3]],
    [[523, 0, 1.1, "sine", 0.2], [659, 0, 1.1, "sine", 0.2], [784, 0, 1.1, "sine", 0.2]],
    [[659, 0, 0.2, "triangle", 0.35], [988, 0.18, 0.6, "triangle", 0.35]],
  ],
};

/** The clinic's default pick per sound (A = 0, B = 1, C = 2), chosen 23 Nov 2026. */
export const DEFAULT_CHOICE: Record<Sound, number> = { in: 2, out: 1, form: 0, rep: 2, redo: 2, reset: 2, done: 0 };

/** What each sound means, for the settings page. */
export const SOUND_INFO: { id: Sound; en: string; hi: string; whenEn: string; whenHi: string }[] = [
  { id: "in", en: "In place", hi: "सही जगह पर", whenEn: "You're inside the box: counting starts.", whenHi: "आप बॉक्स में हैं: गिनती शुरू।" },
  { id: "out", en: "Out of the box", hi: "बॉक्स से बाहर", whenEn: "You stepped out: counting pauses.", whenHi: "आप बाहर गए: गिनती रुकी।" },
  { id: "form", en: "Form problem", hi: "फ़ॉर्म की गलती", whenEn: "Something is wrong during a rep.", whenHi: "रेप के दौरान कुछ गलत है।" },
  { id: "rep", en: "Rep counted", hi: "रेप गिना गया", whenEn: "A complete, correct rep.", whenHi: "पूरा, सही रेप।" },
  { id: "redo", en: "Rep not complete", hi: "रेप अधूरा", whenEn: "That rep didn't count: do it again.", whenHi: "वह रेप नहीं गिना गया: फिर कीजिए।" },
  { id: "reset", en: "Hold reset", hi: "होल्ड फिर से", whenEn: "The hold broke: the timer starts again.", whenHi: "होल्ड टूटा: टाइमर फिर से।" },
  { id: "done", en: "Set or hold done", hi: "सेट या होल्ड पूरा", whenEn: "Set finished or hold reached zero.", whenHi: "सेट पूरा या होल्ड शून्य पर।" },
];

export const OPTION_COUNT = 3;
const KEY = "kynex.sounds";

/** The patient's own choices on this phone (settings page), falling back to the clinic's picks. */
export function soundSettings(): { on: boolean; choice: Record<Sound, number> } {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { on?: boolean; choice?: Partial<Record<Sound, number>> };
    return { on: saved.on !== false, choice: { ...DEFAULT_CHOICE, ...saved.choice } };
  } catch {
    return { on: true, choice: { ...DEFAULT_CHOICE } };
  }
}

export function saveSoundSettings(next: { on: boolean; choice: Record<Sound, number> }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: not remembered */
  }
}

let ctx: AudioContext | null = null;
const lastPlayed = new Map<Sound, number>();

/** Call inside a tap (e.g. "Start with the camera") so phones allow sound later. */
export function unlockSounds(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Plays a sound with the patient's chosen tone. The same sound at most every 1.2 s. */
export function playSound(sound: Sound): void {
  const now = performance.now();
  if (now - (lastPlayed.get(sound) ?? -Infinity) < 1200) return;
  lastPlayed.set(sound, now);
  const settings = soundSettings();
  if (!settings.on) return;
  playOption(sound, settings.choice[sound]);
}

/** Plays one option of a sound (also used to preview options on the settings page). */
export function playOption(sound: Sound, option: number): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    for (const [f, s, len, wave, vol, slide] of OPTIONS[sound][option] ?? OPTIONS[sound][0]!) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(f, t0 + s);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + s + len);
      g.gain.setValueAtTime(0.0001, t0 + s);
      g.gain.exponentialRampToValueAtTime(vol, t0 + s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + len);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + s);
      o.stop(t0 + s + len + 0.05);
    }
  } catch {
    /* no sound on this device: the screen still shows everything */
  }
}
