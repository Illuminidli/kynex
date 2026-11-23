import type { LocalisedText } from "@kynex/motion";

export type Lang = "en" | "hi";

const LOCALE: Record<Lang, string> = { en: "en-IN", hi: "hi-IN" };

/* ------------------------------------------------------------------ recorded voice */

/**
 * Recorded voice: clips made once with an open-source voice model (see the kynex-voice project)
 * and served from /voice/<lang>/<id>.mp3. /voice/manifest.json maps each spoken phrase to its
 * clip. A line is played from clips when every part of it has one (e.g. "4. Keep your elbow
 * straight." = clip "4" + clip "Keep your elbow straight."); otherwise the phone's own voice
 * says it, so nothing is ever silent.
 */
type Manifest = Record<Lang, Record<string, string>>;
let manifest: Manifest | null = null;
let manifestLoading: Promise<void> | null = null;
const audioCache = new Map<string, HTMLAudioElement>();
let playing: { cancel: () => void } | null = null;

/** Lower-case, no punctuation or extra spaces, so small differences don't stop a match. */
export const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.,!?।:;'"’‘“”()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function loadManifest(): Promise<void> {
  manifestLoading ??= fetch("/voice/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .then((m) => void (manifest = m))
    .catch(() => void (manifest = null));
  return manifestLoading;
}
void loadManifest();

/** Splits a line into known phrases, longest first from the left; null if any part has no clip. */
export function clipsFor(text: string, phrases: Record<string, string>): string[] | null {
  const words = normalise(text).split(" ").filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    let found: string | null = null;
    for (let j = words.length; j > i; j--) {
      const id = phrases[words.slice(i, j).join(" ")];
      if (id) {
        found = id;
        i = j;
        break;
      }
    }
    if (!found) return null;
    out.push(found);
  }
  return out.length ? out : null;
}

function playClips(lang: Lang, ids: string[]): void {
  let stopped = false;
  let current: HTMLAudioElement | null = null;
  const done = () => {
    if (playing === handle) playing = null;
  };
  const handle = {
    cancel: () => {
      stopped = true;
      current?.pause();
      done();
    },
  };
  playing = handle;
  const next = (k: number) => {
    if (stopped) return;
    if (k >= ids.length) return done();
    const src = `/voice/${lang}/${ids[k]}.mp3`;
    let a = audioCache.get(src);
    if (!a) {
      a = new Audio(src);
      a.preload = "auto";
      audioCache.set(src, a);
    }
    current = a;
    a.currentTime = 0;
    a.onended = () => next(k + 1);
    a.onerror = () => next(k + 1);
    void a.play().catch(() => next(k + 1));
  };
  next(0);
}

/* ------------------------------------------------------------------ phone voice (fallback) */

/** Picks the most natural voice the device offers (Edge and Chrome "Natural" / Google voices). */
function pickVoice(lang: Lang): SpeechSynthesisVoice | undefined {
  if (!("speechSynthesis" in window)) return undefined;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural/i.test(v.name) ? 8 : 0) +
    (/online|google/i.test(v.name) ? 4 : 0) +
    (v.lang.toLowerCase() === LOCALE[lang].toLowerCase() ? 2 : 0) +
    (/female|neerja|swara|heera/i.test(v.name) ? 1 : 0);
  return voices.sort((a, b) => score(b) - score(a))[0];
}

export function canSpeak(): boolean {
  return "speechSynthesis" in window || typeof Audio !== "undefined";
}

/** True while a line is still being spoken (or queued). */
export function isSpeaking(): boolean {
  if (playing) return true;
  return "speechSynthesis" in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
}

export function speak(text: LocalisedText | string, lang: Lang): void {
  const words = typeof text === "string" ? text : text[lang] || text.en;
  const ids = manifest ? clipsFor(words, manifest[lang] ?? {}) : null;
  if (ids) return playClips(lang, ids);
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(words);
  u.lang = LOCALE[lang];
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.rate = lang === "hi" ? 0.95 : 1;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  playing?.cancel();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

// Some browsers load their voice list late; asking early makes the first line use the right voice.
if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
