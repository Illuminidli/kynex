import { bodyTurn, hiddenLandmarks, nearSide, visibility } from "./geometry.ts";
import type { Side } from "./landmarks.ts";
import type {
  ExerciseDefinition,
  ExerciseOverrides,
  FaultRule,
  HoldRule,
  LocalisedText,
  PoseFrame,
  RepRule,
} from "./types.ts";

export interface RepRecord {
  index: number;
  side: Side | null;
  startMs: number;
  endMs: number;
  /** Extreme metric value reached during the rep (the range of motion for this rep). */
  peak: number;
  /** Fraction of target range reached (can exceed 1). */
  progress: number;
  full: boolean;
  /** How long the end position was held, ms. */
  heldMs: number;
  faults: string[];
  quality: number;
  secondary: Record<string, number>;
}

export interface HoldRecord {
  side: Side | null;
  /** When the hold started and ended (same clock as the frames, ms). */
  startMs: number;
  endMs: number;
  seconds: number;
  completed: boolean;
  best: number;
  faults: string[];
  quality: number;
  secondary: Record<string, number>;
}

export type TrackerEvent =
  | { type: "rep"; rep: RepRecord }
  | { type: "partial"; rep: RepRecord; cue: LocalisedText }
  | { type: "fault"; side: Side | null; fault: FaultRule }
  | { type: "hold-complete"; hold: HoldRecord }
  | { type: "visibility"; ok: boolean; missing: number[] }
  /** The person is turned the wrong way for this exercise (e.g. facing the camera for a side-on exercise). */
  | { type: "view"; ok: boolean; want: "front" | "side" }
  | { type: "baseline-ready" }
  /** The start reading was thrown away (the person moved, or wasn't in the start position); it is being taken again. */
  | { type: "baseline-retry" };

export type TrackerStatus = "calibrating" | "not-visible" | "wrong-view" | "ready" | "active" | "holding";

export interface TrackerSnapshot {
  status: TrackerStatus;
  /** Current metric value per tracked side. */
  values: Partial<Record<Side, number | null>>;
  /** Current progress toward target (0..1) of the most advanced side. */
  progress: number;
  reps: { total: number; full: number; partial: number; left: number; right: number };
  holdSeconds: number;
  holdTarget: number;
  holdsCompleted: number;
  activeFaults: FaultRule[];
  visibility: number;
  /** Required landmarks currently off-screen or undetected (for "I can't see your knees"). */
  missing: number[];
  /** Body turn from facing the camera, 0..90 degrees (null if unknown). */
  turn: number | null;
  best: Partial<Record<Side, number>>;
  calibrationProgress: number;
}

export interface SessionResult {
  exerciseId: string;
  startedAt: number;
  endedAt: number;
  sides: Side[];
  reps: RepRecord[];
  holds: HoldRecord[];
  /** Best range of motion per side (metric units). */
  best: Partial<Record<Side, number>>;
  /** Mean peak across full + partial reps per side. */
  mean: Partial<Record<Side, number>>;
  quality: number;
  faultCounts: Record<string, number>;
  visibleRatio: number;
  activeSeconds: number;
  secondaryBest: Record<string, number>;
  thresholds: { reps?: RepRule; hold?: HoldRule };
}

export interface TrackerOptions {
  /** Side for unilateral exercises. Defaults to the side closest to the camera. */
  side?: Side;
  overrides?: ExerciseOverrides;
  /** Duration of neutral-baseline capture. */
  baselineMs?: number;
  /** Minimum mean landmark visibility to track. */
  minVisibility?: number;
}

/** Side-on exercises need the body turned at least this far from facing the camera (degrees). */
const SIDE_MIN_TURN = 35;
/** Facing exercises allow at most this much turn. */
const FRONT_MAX_TURN = 55;
/** How long the wrong orientation must persist before tracking pauses (avoids flicker). */
const VIEW_DEBOUNCE_MS = 700;

export const PARTIAL_CUE: LocalisedText = {
  en: "Good. Try to go a little further next time.",
  hi: "अच्छा। अगली बार थोड़ा और आगे तक जाइए।",
};
export const HOLD_CUE: LocalisedText = {
  en: "Hold the end position a little longer.",
  hi: "आख़िरी स्थिति में थोड़ा और रुकिए।",
};

const FAULT_DEBOUNCE_MS = 250;
const FAULT_CUE_INTERVAL_MS = 3500;
const HOLD_DROPOUT_MS = 400;

interface FaultState {
  since: number | null;
  active: boolean;
  lastCue: number;
}

interface SecondaryAcc {
  value: number;
  n: number;
  sum: number;
  sumSq: number;
}

class SideMachine {
  phase: "rest" | "active" = "rest";
  startT = 0;
  peakP = -Infinity;
  peakV = NaN;
  atPeakSince: number | null = null;
  heldMs = 0;
  faultsInRep = new Set<string>();
  faults = new Map<string, FaultState>();
  secondary = new Map<string, SecondaryAcc>();
  value: number | null = null;
  progress = 0;
  // hold
  holdStart: number | null = null;
  lastInZone = 0;
  holdAccMs = 0;
  holdBest = NaN;
  holdDoneThisSegment = false;
  best = NaN;
  readonly side: Side;

  constructor(side: Side) {
    this.side = side;
  }

  resetRep(): void {
    this.peakP = -Infinity;
    this.peakV = NaN;
    this.atPeakSince = null;
    this.heldMs = 0;
    this.faultsInRep.clear();
    this.secondary.clear();
  }
}

/**
 * A start reading is steady when most samples sit close to the middle value: a few jittery
 * frames are fine, a person still moving is not.
 */
function steadyStart(samples: number[], mid: number, unit: string): boolean {
  const tolerance = unit === "deg" ? 8 : unit === "cm" ? 3 : Infinity;
  const close = samples.filter((v) => Math.abs(v - mid) <= tolerance).length;
  return close >= 0.8 * samples.length;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

function qualityOf(faultIds: Iterable<string>, rules: FaultRule[], full: boolean): number {
  let q = full ? 100 : 75;
  for (const id of faultIds) {
    const r = rules.find((x) => x.id === id);
    q -= r?.severity === "major" ? 25 : 10;
  }
  return Math.max(0, Math.min(100, q));
}

/**
 * Real-time tracker for one exercise. Feed it smoothed PoseFrames; it returns events
 * (reps, faults, holds) and exposes a snapshot for UI rendering.
 */
export class ExerciseTracker {
  readonly def: ExerciseDefinition;
  readonly repRule: Required<RepRule> | null;
  readonly holdRule: HoldRule | null;
  private readonly opts: Required<Pick<TrackerOptions, "baselineMs" | "minVisibility">> & TrackerOptions;
  private machines: SideMachine[] = [];
  private lockedSide: Side | null;
  private baseline = new Map<Side, number>();
  private baselineSamples = new Map<Side, number[]>();
  private baselineStart: number | null = null;
  private baselineDone: boolean;
  private reps: RepRecord[] = [];
  private holds: HoldRecord[] = [];
  private faultCounts: Record<string, number> = {};
  private firstT: number | null = null;
  private lastT = 0;
  private frames = 0;
  private visibleFrames = 0;
  private activeMs = 0;
  private wasVisible = true;
  private lastVisibility = 0;
  private status: TrackerStatus = "ready";
  private missing: number[] = [];
  private turn: number | null = null;
  private wrongView = false;
  private wrongViewSince: number | null = null;
  private rightViewSince: number | null = null;

  constructor(def: ExerciseDefinition, options: TrackerOptions = {}) {
    this.def = def;
    this.opts = { baselineMs: 1500, minVisibility: 0.5, ...options };
    this.repRule = def.reps
      ? {
          enter: 0.35,
          exit: 0.15,
          full: 0.85,
          partial: 0.5,
          minRepMs: 500,
          holdMs: 0,
          ...def.reps,
          ...options.overrides?.reps,
        }
      : null;
    this.holdRule = def.hold ? { ...def.hold, ...options.overrides?.hold } : null;
    this.lockedSide = options.side ?? null;
    this.baselineDone = !def.metric.baselineOf;
    if (def.laterality === "alternating") {
      this.machines = [new SideMachine("left"), new SideMachine("right")];
    }
  }

  private ensureMachines(f: PoseFrame): void {
    if (this.machines.length) return;
    const side = this.lockedSide ?? nearSide(f);
    if (this.def.laterality === "unilateral") this.lockedSide = side;
    this.machines = [new SideMachine(side)];
  }

  /** For bilateral exercises viewed from the side, follow the near side each frame. */
  private sideFor(m: SideMachine, f: PoseFrame): Side {
    if (this.def.laterality === "bilateral" && !this.opts.side) return nearSide(f);
    return m.side;
  }

  update(f: PoseFrame): TrackerEvent[] {
    const events: TrackerEvent[] = [];
    if (this.firstT === null) this.firstT = f.t;
    const dt = this.frames > 0 ? Math.min(f.t - this.lastT, 200) : 0;
    this.lastT = f.t;
    this.frames++;
    this.ensureMachines(f);

    // Visibility gate.
    const req = new Set<number>();
    for (const m of this.machines) for (const i of this.def.required(this.sideFor(m, f))) req.add(i);
    const vis = visibility(f, [...req]);
    this.lastVisibility = vis;
    // Every required joint must be on screen: a joint MediaPipe has to guess gives false angles.
    this.missing = hiddenLandmarks(f, [...req]);
    const visible = vis >= this.opts.minVisibility && this.missing.length === 0;
    if (visible !== this.wasVisible) {
      events.push({ type: "visibility", ok: visible, missing: this.missing });
      this.wasVisible = visible;
    }
    if (!visible) {
      this.status = "not-visible";
      return events;
    }
    this.visibleFrames++;

    // Orientation gate: a side-on exercise measured from the front (or vice versa) gives nonsense numbers.
    this.turn = bodyTurn(f);
    if (this.turn !== null) {
      const wrong = this.def.view === "side" ? this.turn < SIDE_MIN_TURN : this.turn > FRONT_MAX_TURN;
      if (wrong) {
        this.rightViewSince = null;
        if (this.wrongViewSince === null) this.wrongViewSince = f.t;
      } else {
        this.wrongViewSince = null;
        if (this.rightViewSince === null) this.rightViewSince = f.t;
      }
      if (!this.wrongView && this.wrongViewSince !== null && f.t - this.wrongViewSince >= VIEW_DEBOUNCE_MS) {
        this.wrongView = true;
        events.push({ type: "view", ok: false, want: this.def.view });
      } else if (this.wrongView && this.rightViewSince !== null && f.t - this.rightViewSince >= VIEW_DEBOUNCE_MS / 2) {
        this.wrongView = false;
        events.push({ type: "view", ok: true, want: this.def.view });
      }
    }
    if (this.wrongView) {
      this.status = "wrong-view";
      return events;
    }

    // Neutral baseline capture.
    if (!this.baselineDone) {
      this.status = "calibrating";
      if (this.baselineStart === null) this.baselineStart = f.t;
      for (const m of this.machines) {
        const s = this.sideFor(m, f);
        const v = this.def.metric.baselineOf?.(f, s);
        if (v !== null && v !== undefined && Number.isFinite(v)) {
          const arr = this.baselineSamples.get(m.side) ?? [];
          arr.push(v);
          this.baselineSamples.set(m.side, arr);
        }
      }
      if (f.t - this.baselineStart >= this.opts.baselineMs) {
        const taken = new Map<Side, number>();
        let usable = true;
        for (const m of this.machines) {
          const arr = this.baselineSamples.get(m.side);
          if (!arr || !arr.length) continue;
          const mid = median(arr);
          if (!steadyStart(arr, mid, this.def.metric.unit) || Math.abs(mid) > (this.def.metric.baselineLimit ?? Infinity)) usable = false;
          taken.set(m.side, mid);
        }
        if (!usable) {
          // Moving, or not in the start position (e.g. still looking aside): take it again.
          this.baselineStart = f.t;
          this.baselineSamples.clear();
          events.push({ type: "baseline-retry" });
          return events;
        }
        for (const [s, v] of taken) this.baseline.set(s, v);
        this.baselineDone = true;
        events.push({ type: "baseline-ready" });
      }
      return events;
    }

    let anyActive = false;
    let anyHolding = false;
    for (const m of this.machines) {
      const side = this.sideFor(m, f);
      const v = this.def.metric.compute(f, side, { baseline: this.baseline.get(m.side) ?? null });
      m.value = v !== null && Number.isFinite(v) ? v : null;
      if (m.value === null) continue;

      this.updateSecondary(m, f, side);
      this.evaluateFaults(m, f, side, events);

      if (this.repRule) {
        this.stepReps(m, f.t, events);
        if (m.phase === "active") anyActive = true;
      }
      if (this.holdRule) {
        if (this.stepHold(m, f.t, events)) anyHolding = true;
      }
    }
    if (anyActive || anyHolding) this.activeMs += dt;
    this.status = anyHolding ? "holding" : anyActive ? "active" : "ready";
    return events;
  }

  private updateSecondary(m: SideMachine, f: PoseFrame, side: Side): void {
    const active = m.phase === "active" || m.holdStart !== null;
    if (!active || !this.def.secondary) return;
    for (const s of this.def.secondary) {
      const v = s.compute(f, side);
      if (v === null || !Number.isFinite(v)) continue;
      const acc = m.secondary.get(s.id) ?? { value: NaN, n: 0, sum: 0, sumSq: 0 };
      acc.n++;
      acc.sum += v;
      acc.sumSq += v * v;
      if (s.keep === "min") acc.value = Number.isNaN(acc.value) ? v : Math.min(acc.value, v);
      else if (s.keep === "max") acc.value = Number.isNaN(acc.value) ? v : Math.max(acc.value, v);
      else {
        const mean = acc.sum / acc.n;
        acc.value = Math.sqrt(Math.max(0, acc.sumSq / acc.n - mean * mean));
      }
      m.secondary.set(s.id, acc);
    }
  }

  private evaluateFaults(m: SideMachine, f: PoseFrame, side: Side, events: TrackerEvent[]): void {
    const moving = m.phase === "active" || m.holdStart !== null;
    for (const rule of this.def.faults) {
      const st = m.faults.get(rule.id) ?? { since: null, active: false, lastCue: -Infinity };
      const applies = rule.phase === "any" || moving;
      let hit = false;
      const seen = !rule.uses || hiddenLandmarks(f, rule.uses(side), 0.5).length === 0;
      if (applies && seen) {
        try {
          hit = rule.test(f, side);
        } catch {
          hit = false;
        }
      }
      if (hit) {
        if (st.since === null) st.since = f.t;
        if (!st.active && f.t - st.since >= FAULT_DEBOUNCE_MS) {
          st.active = true;
          this.faultCounts[rule.id] = (this.faultCounts[rule.id] ?? 0) + 1;
        }
        if (st.active) {
          m.faultsInRep.add(rule.id);
          if (f.t - st.lastCue >= FAULT_CUE_INTERVAL_MS) {
            st.lastCue = f.t;
            events.push({ type: "fault", side: this.def.laterality === "bilateral" ? null : m.side, fault: rule });
          }
        }
      } else {
        st.since = null;
        st.active = false;
      }
      m.faults.set(rule.id, st);
    }
  }

  private progressOf(v: number): number {
    const r = this.repRule ?? { rest: 0, target: this.holdRule?.threshold ?? 1 };
    const span = r.target - r.rest;
    if (span === 0) return 0;
    return (v - r.rest) / span;
  }

  private stepReps(m: SideMachine, t: number, events: TrackerEvent[]): void {
    const r = this.repRule!;
    const v = m.value!;
    const p = this.progressOf(v);
    m.progress = p;
    if (m.phase === "rest") {
      if (p >= r.enter) {
        m.phase = "active";
        m.startT = t;
        m.resetRep();
      }
    }
    if (m.phase === "active") {
      if (p > m.peakP) {
        m.peakP = p;
        m.peakV = v;
      }
      if (p >= r.full) {
        if (m.atPeakSince === null) m.atPeakSince = t;
        m.heldMs = Math.max(m.heldMs, t - m.atPeakSince);
      } else {
        m.atPeakSince = null;
      }
      if (p <= r.exit) {
        m.phase = "rest";
        const dur = t - m.startT;
        if (dur >= r.minRepMs && m.peakP >= r.partial) {
          const reachedFull = m.peakP >= r.full;
          const heldEnough = m.heldMs >= r.holdMs;
          const full = reachedFull && heldEnough;
          const secondary: Record<string, number> = {};
          for (const [k, acc] of m.secondary) if (Number.isFinite(acc.value)) secondary[k] = acc.value;
          const rep: RepRecord = {
            index: this.reps.length + 1,
            side: this.def.laterality === "bilateral" ? null : m.side,
            startMs: m.startT,
            endMs: t,
            peak: m.peakV,
            progress: m.peakP,
            full,
            heldMs: m.heldMs,
            faults: [...m.faultsInRep],
            quality: qualityOf(m.faultsInRep, this.def.faults, full),
            secondary,
          };
          this.reps.push(rep);
          if (this.isBetter(m.peakV, m.best)) m.best = m.peakV;
          if (full) events.push({ type: "rep", rep });
          else events.push({ type: "partial", rep, cue: reachedFull ? HOLD_CUE : PARTIAL_CUE });
        }
        m.resetRep();
      }
    }
  }

  /** Larger progress = better, regardless of whether the metric rises or falls. */
  private isBetter(v: number, current: number): boolean {
    if (Number.isNaN(current)) return true;
    return this.progressOf(v) > this.progressOf(current);
  }

  /** Returns true while the side is in the hold zone. */
  private stepHold(m: SideMachine, t: number, events: TrackerEvent[]): boolean {
    const h = this.holdRule!;
    const v = m.value!;
    const inZone = h.comparator === "gte" ? v >= h.threshold : v <= h.threshold;
    m.progress = Math.max(0, Math.min(1, m.holdStart === null ? 0 : m.holdAccMs / (h.targetSeconds * 1000)));

    if (inZone) {
      if (m.holdStart === null) {
        m.holdStart = t;
        m.holdAccMs = 0;
        m.holdBest = v;
        m.holdDoneThisSegment = false;
        m.faultsInRep.clear();
        m.secondary.clear();
      } else {
        m.holdAccMs += Math.min(t - m.lastInZone, 200);
      }
      m.lastInZone = t;
      if (h.comparator === "gte" ? v > m.holdBest : v < m.holdBest) m.holdBest = v;
      if (!m.holdDoneThisSegment && m.holdAccMs >= h.targetSeconds * 1000) {
        m.holdDoneThisSegment = true;
        events.push({ type: "hold-complete", hold: this.closeHold(m, true) });
      }
      return true;
    }

    if (m.holdStart !== null && t - m.lastInZone > HOLD_DROPOUT_MS) {
      if (!m.holdDoneThisSegment && m.holdAccMs >= 1000) this.closeHold(m, false);
      m.holdStart = null;
      m.holdAccMs = 0;
    }
    return m.holdStart !== null;
  }

  private closeHold(m: SideMachine, completed: boolean): HoldRecord {
    const secondary: Record<string, number> = {};
    for (const [k, acc] of m.secondary) if (Number.isFinite(acc.value)) secondary[k] = acc.value;
    const rec: HoldRecord = {
      side: this.def.laterality === "bilateral" ? null : m.side,
      startMs: m.holdStart ?? this.lastT,
      endMs: this.lastT,
      seconds: Math.round(m.holdAccMs / 100) / 10,
      completed,
      best: m.holdBest,
      faults: [...m.faultsInRep],
      quality: qualityOf(m.faultsInRep, this.def.faults, completed),
      secondary,
    };
    this.holds.push(rec);
    if (Number.isNaN(m.best) || (this.holdRule!.comparator === "gte" ? m.holdBest > m.best : m.holdBest < m.best)) {
      m.best = m.holdBest;
    }
    return rec;
  }

  snapshot(): TrackerSnapshot {
    const values: Partial<Record<Side, number | null>> = {};
    const best: Partial<Record<Side, number>> = {};
    let progress = 0;
    let holdSeconds = 0;
    const active = new Map<string, FaultRule>();
    for (const m of this.machines) {
      values[m.side] = m.value;
      if (Number.isFinite(m.best)) best[m.side] = m.best;
      progress = Math.max(progress, m.progress);
      holdSeconds = Math.max(holdSeconds, m.holdAccMs / 1000);
      for (const [id, st] of m.faults) {
        if (st.active) {
          const r = this.def.faults.find((x) => x.id === id);
          if (r) active.set(id, r);
        }
      }
    }
    const full = this.reps.filter((r) => r.full).length;
    const calibrationProgress =
      this.baselineDone || this.baselineStart === null
        ? this.baselineDone
          ? 1
          : 0
        : Math.min(1, (this.lastT - this.baselineStart) / this.opts.baselineMs);
    return {
      status: this.status,
      values,
      progress: Math.max(0, Math.min(1, progress)),
      reps: {
        total: this.reps.length,
        full,
        partial: this.reps.length - full,
        left: this.reps.filter((r) => r.side === "left").length,
        right: this.reps.filter((r) => r.side === "right").length,
      },
      holdSeconds,
      holdTarget: this.holdRule?.targetSeconds ?? 0,
      holdsCompleted: this.holds.filter((h) => h.completed).length,
      activeFaults: [...active.values()],
      visibility: this.lastVisibility,
      missing: this.missing,
      turn: this.turn,
      best,
      calibrationProgress,
    };
  }

  /** Reps and holds recorded so far (read-only, does not close open holds). */
  history(): { reps: readonly RepRecord[]; holds: readonly HoldRecord[] } {
    return { reps: this.reps.slice(), holds: this.holds.slice() };
  }

  /** Close any open hold and return the session result. */
  finish(): SessionResult {
    for (const m of this.machines) {
      if (this.holdRule && m.holdStart !== null && !m.holdDoneThisSegment && m.holdAccMs >= 1000) {
        this.closeHold(m, false);
        m.holdStart = null;
      }
    }
    const best: Partial<Record<Side, number>> = {};
    const mean: Partial<Record<Side, number>> = {};
    for (const m of this.machines) {
      if (Number.isFinite(m.best)) best[m.side] = m.best;
      const peaks = this.reps.filter((r) => (r.side ?? m.side) === m.side).map((r) => r.peak);
      if (peaks.length) mean[m.side] = peaks.reduce((a, b) => a + b, 0) / peaks.length;
    }
    const qs = [...this.reps.map((r) => r.quality), ...this.holds.map((h) => h.quality)];
    const quality = qs.length ? Math.round(qs.reduce((a, b) => a + b, 0) / qs.length) : 0;
    const secondaryBest: Record<string, number> = {};
    for (const s of this.def.secondary ?? []) {
      const vals = [...this.reps, ...this.holds].map((r) => r.secondary[s.id]).filter((x): x is number => x !== undefined);
      if (vals.length) secondaryBest[s.id] = s.keep === "min" ? Math.min(...vals) : s.keep === "max" ? Math.max(...vals) : Math.min(...vals);
    }
    return {
      exerciseId: this.def.id,
      startedAt: this.firstT ?? 0,
      endedAt: this.lastT,
      sides: this.machines.map((m) => m.side),
      reps: this.reps,
      holds: this.holds,
      best,
      mean,
      quality,
      faultCounts: { ...this.faultCounts },
      visibleRatio: this.frames ? this.visibleFrames / this.frames : 0,
      activeSeconds: Math.round(this.activeMs / 100) / 10,
      secondaryBest,
      thresholds: { reps: this.repRule ?? undefined, hold: this.holdRule ?? undefined },
    };
  }
}
