/**
 * Decides what the voice coach says and when, so it never talks over itself or nags.
 * It turns tracker events into short spoken lines; the app plays them with whatever
 * voice it has. Sounds (beeps and chimes) are the app's job: see `soundFor`.
 *
 * Rules (from the 23 Nov 2026 phone tests: the coach talked too much):
 * - Nothing is spoken DURING a rep. A form problem only plays the short form sound.
 * - After each rep, ONE line: the count for a full rep ("4"), the count plus one correction
 *   if the rep had a problem ("4. Keep your elbow straight"), or "Not complete" with the
 *   reason for a rep that doesn't count. Then it stays quiet so the patient can adjust.
 * - Nothing is ever cut off: a new line waits until the current one has finished.
 * - Only one line waits at a time. A more important line replaces a less important one.
 *   Order: milestone (set done, begin) > count > setup (step back into the box).
 * - Setup reminders: at most one every 10 s.
 * - A number is only announced once (alternating exercises count a rep when both sides are done).
 */
import { bodyPartNames } from "./explain.ts";
import { HOLD_CUE, type TrackerEvent } from "./tracker.ts";
import type { FaultRule, LocalisedText } from "./types.ts";

export type CueKind = "milestone" | "count" | "setup" | "tip";
/** The sounds a session can play, each with one meaning. */
export type Sound = "in" | "out" | "form" | "rep" | "redo" | "reset" | "done";

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
    this.o = { tipGapMs: 8000, sameTipGapMs: 20000, setupGapMs: 10000, tipMaxWaitMs: 1500, ...options };
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
  hear(events: TrackerEvent[], now: number, count: () => number, faults: FaultRule[] = []): void {
    const cueOf = (ids: string[]) => faults.find((f) => f.id === ids[0])?.cue ?? null;
    for (const e of events) {
      switch (e.type) {
        case "rep": {
          const n = count();
          if (n <= this.lastCount) break;
          this.lastCount = n;
          // One correction after the rep, if it had a problem; otherwise just the number.
          const fix = cueOf(e.rep.faults);
          this.offer("count", fix ? t(`${n}. ${fix.en}`, `${n}। ${fix.hi}`) : number(n), now);
          break;
        }
        case "partial": {
          // Doesn't count: say why, and ask for it again.
          const why =
            e.cue === HOLD_CUE
              ? t("Hold the top a little longer", "ऊपर थोड़ा और रुकिए")
              : (cueOf(e.rep.faults) ?? t("Go a little further", "थोड़ा और आगे जाइए"));
          this.offer("count", t(`Not complete. ${why.en}, and do that one again.`, `पूरा नहीं हुआ। ${why.hi}, और वह फिर से कीजिए।`), now);
          break;
        }
        case "hold-complete":
          this.offer("milestone", t("Hold complete. Well done.", "होल्ड पूरा। बहुत बढ़िया।"), now);
          break;
        case "hold-broken":
          this.offer("count", t("Foot down. Lift again, the timer starts again.", "पैर नीचे आ गया। फिर उठाइए, टाइमर फिर से शुरू।"), now);
          break;
        case "placement":
          this.offer(
            e.ok ? "milestone" : "setup",
            e.ok ? t("Good, you're in place. Begin.", "ठीक है, आप सही जगह पर हैं। शुरू कीजिए।") : t("Step back into the box.", "बॉक्स में वापस आइए।"),
            now,
          );
          break;
        case "baseline-retry":
          this.offer("setup", t("Hold still in the starting position.", "शुरुआती स्थिति में स्थिर रहिए।"), now);
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
        // "fault": no words during the rep; the app plays the form sound.
      }
    }
  }

  /** The sound to play for an event (the app maps these to its chosen chimes). */
  static soundFor(e: TrackerEvent): Sound | null {
    switch (e.type) {
      case "placement":
        return e.ok ? "in" : "out";
      case "fault":
        return "form";
      case "rep":
        return "rep";
      case "partial":
        return "redo";
      case "hold-broken":
        return "reset";
      case "hold-complete":
        return "done";
      default:
        return null;
    }
  }
}
