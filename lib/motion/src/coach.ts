/**
 * Decides what the voice coach says and when, so it never talks over itself or nags.
 * It turns tracker events into short spoken lines; the app plays them with whatever
 * voice it has (the phone's built-in voice now, pre-recorded natural voice in M4).
 *
 * Rules:
 * - Nothing is ever cut off: a new line waits until the current one has finished.
 * - Only one line waits at a time. A more important line replaces a less important one.
 *   Order: milestone (set done, begin) > count > setup (step back, turn) > tip.
 * - Tips: at most one every 8 s, the same tip at most once every 20 s, and a tip that
 *   had to wait more than 1.5 s is dropped (it's about a moment that has passed).
 * - Setup reminders: at most one every 6 s.
 * - Counts are never dropped, but a newer count replaces an older waiting one. A number is
 *   only announced once (alternating exercises count a rep when both sides are done).
 * - A partial rep is still counted, with a two-word nudge: "4. A little further."
 */
import { bodyPartNames } from "./explain.ts";
import { HOLD_CUE, type TrackerEvent } from "./tracker.ts";
import type { LocalisedText } from "./types.ts";

export type CueKind = "milestone" | "count" | "setup" | "tip";

export interface Cue {
  kind: CueKind;
  text: LocalisedText;
  /** When the cue was offered (ms). */
  at: number;
}

export interface CoachOptions {
  tipGapMs?: number;
  sameTipGapMs?: number;
  setupGapMs?: number;
  tipMaxWaitMs?: number;
}

const RANK: Record<CueKind, number> = { milestone: 3, count: 2, setup: 1, tip: 0 };

const t = (en: string, hi: string): LocalisedText => ({ en, hi });
const number = (n: number): LocalisedText => ({ en: String(n), hi: String(n) });

export class VoiceCoach {
  private pending: Cue | null = null;
  private lastTipAt = -Infinity;
  private lastSetupAt = -Infinity;
  private lastSaid = new Map<string, number>();
  private lastCount = 0;
  private readonly o: Required<CoachOptions>;

  constructor(options: CoachOptions = {}) {
    this.o = { tipGapMs: 8000, sameTipGapMs: 20000, setupGapMs: 6000, tipMaxWaitMs: 1500, ...options };
  }

  /** Offer a line. Returns false when the rules drop it straight away. */
  offer(kind: CueKind, text: LocalisedText, now: number): boolean {
    if (kind === "tip") {
      if (now - this.lastTipAt < this.o.tipGapMs) return false;
      if (now - (this.lastSaid.get(text.en) ?? -Infinity) < this.o.sameTipGapMs) return false;
    }
    if (kind === "setup" && now - this.lastSetupAt < this.o.setupGapMs) return false;
    if (this.pending && RANK[this.pending.kind] > RANK[kind]) return false;
    this.pending = { kind, text, at: now };
    return true;
  }

  /**
   * Call on every frame. Returns the line to speak now, or null. `speaking` says whether
   * the voice is still busy with the previous line.
   */
  take(now: number, speaking: boolean): Cue | null {
    const cue = this.pending;
    if (!cue || speaking) return null;
    this.pending = null;
    if (cue.kind === "tip" && now - cue.at > this.o.tipMaxWaitMs) return null;
    if (cue.kind === "tip") this.lastTipAt = now;
    if (cue.kind === "setup") this.lastSetupAt = now;
    this.lastSaid.set(cue.text.en, now);
    return cue;
  }

  /** Forget everything waiting (e.g. when the camera stops). */
  clear(): void {
    this.pending = null;
    this.lastCount = 0;
  }

  /**
   * Turn tracker events into offers. `count` is the number to announce after a rep
   * (the caller knows how reps map to the set, e.g. alternating sides).
   */
  hear(events: TrackerEvent[], now: number, count: () => number): void {
    for (const e of events) {
      switch (e.type) {
        case "rep":
        case "partial": {
          const n = count();
          if (n <= this.lastCount) break;
          this.lastCount = n;
          if (e.type === "rep") this.offer("count", number(n), now);
          else {
            const nudge = e.cue === HOLD_CUE ? t("Hold a little longer.", "थोड़ा और रुकिए।") : t("A little further.", "थोड़ा और आगे।");
            this.offer("count", t(`${n}. ${nudge.en}`, `${n}। ${nudge.hi}`), now);
          }
          break;
        }
        case "fault":
          this.offer("tip", e.fault.cue, now);
          break;
        case "hold-complete":
          this.offer("milestone", t("Hold complete. Well done.", "होल्ड पूरा। बहुत बढ़िया।"), now);
          break;
        case "baseline-ready":
          this.offer("milestone", t("Good. Now begin.", "ठीक है। अब शुरू कीजिए।"), now);
          break;
        case "visibility":
          if (!e.ok) {
            const en = bodyPartNames(e.missing, "en");
            const hi = bodyPartNames(e.missing, "hi");
            this.offer(
              "setup",
              en
                ? t(`I can't see your ${en}. Step back a little.`, `मुझे आपके ${hi} नहीं दिख रहे। थोड़ा पीछे जाइए।`)
                : t("I can't see you fully. Step back a little.", "आप पूरे नहीं दिख रहे। थोड़ा पीछे जाइए।"),
              now,
            );
          }
          break;
        case "view":
          if (!e.ok) {
            this.offer(
              "setup",
              e.want === "side"
                ? t("Please turn side-on to the camera.", "कृपया कैमरे की ओर बगल से होइए।")
                : t("Please face the camera.", "कृपया कैमरे की ओर मुँह कीजिए।"),
              now,
            );
          }
          break;
      }
    }
  }
}
