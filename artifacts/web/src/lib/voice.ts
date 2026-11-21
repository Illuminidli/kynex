import type { LocalisedText } from "@kynex/motion";

export type Lang = "en" | "hi";

const LOCALE: Record<Lang, string> = { en: "en-IN", hi: "hi-IN" };

/**
 * Picks the most natural voice the device offers. Edge and Chrome include "Natural" /
 * "Online" / Google voices that sound far less robotic than the system default.
 * M4 replaces this with pre-recorded natural speech.
 */
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
  return "speechSynthesis" in window;
}

/** True while a line is still being spoken (or queued in the browser). */
export function isSpeaking(): boolean {
  return canSpeak() && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
}

export function speak(text: LocalisedText | string, lang: Lang): void {
  if (!canSpeak()) return;
  const words = typeof text === "string" ? text : text[lang] || text.en;
  const u = new SpeechSynthesisUtterance(words);
  u.lang = LOCALE[lang];
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.rate = lang === "hi" ? 0.95 : 1;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

// Some browsers load their voice list late; asking early makes the first line use the right voice.
if (canSpeak()) window.speechSynthesis.getVoices();
