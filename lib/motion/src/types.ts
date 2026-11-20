import type { Side } from "./landmarks.ts";

/** A single landmark. Image coords are normalised 0..1 (y down); world coords are metres, hip-centred (y down). */
export interface Point3 {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** One analysed camera frame. Produced by any pose backend (MediaPipe web, MediaPipe native, ...). */
export interface PoseFrame {
  /** Timestamp in milliseconds (monotonic). */
  t: number;
  /** 33 normalised image landmarks. */
  image: Point3[];
  /** 33 world landmarks in metres. */
  world: Point3[];
  /** Frame width / height, used to make image-space angles isotropic. */
  aspect: number;
}

export type Region =
  | "neck"
  | "shoulder"
  | "elbow"
  | "spine"
  | "hip"
  | "knee"
  | "ankle"
  | "balance"
  | "core";

export type CameraView = "front" | "side";
export type Position = "standing" | "seated" | "supine" | "prone" | "quadruped";
export type ExerciseKind = "reps" | "hold" | "timed-balance";
/**
 * bilateral   - one movement, both sides together (squat). Counted once.
 * unilateral  - one side per set; the side is chosen by the plan or auto-detected (closest to camera).
 * alternating - both sides tracked at once; reps counted per side (marching, neck rotation).
 */
export type Laterality = "bilateral" | "unilateral" | "alternating";
export type MetricUnit = "deg" | "cm" | "s";

export interface LocalisedText {
  en: string;
  hi: string;
}

export interface MetricContext {
  /** Neutral-pose baseline for this metric (only set when the exercise uses one). */
  baseline: number | null;
}

export interface MetricDefinition {
  label: string;
  unit: MetricUnit;
  /**
   * Compute the metric for one side. Return null when it cannot be measured
   * (landmarks hidden, user not in position).
   */
  compute: (f: PoseFrame, side: Side, ctx: MetricContext) => number | null;
  /**
   * If present, the tracker first captures a neutral-pose baseline with this function
   * (median over ~1.5 s while the person stands still) and passes it to compute() as ctx.baseline.
   */
  baselineOf?: (f: PoseFrame, side: Side) => number | null;
}

export interface SecondaryMetric {
  id: string;
  label: string;
  unit: MetricUnit;
  /** "min"/"max" keep the extreme value during a rep or hold; "std" keeps the standard deviation (e.g. sway). */
  keep: "min" | "max" | "std";
  compute: (f: PoseFrame, side: Side) => number | null;
}

export interface RepRule {
  /** Metric value at rest. */
  rest: number;
  /** Metric value at full target range. May be lower than rest (e.g. knee angle in a squat). */
  target: number;
  /** Progress (0..1) at which the movement counts as started. Default 0.35. */
  enter?: number;
  /** Progress at which the movement counts as returned. Default 0.15. */
  exit?: number;
  /** Progress needed for a full rep. Default 0.85. */
  full?: number;
  /** Progress needed to count a partial rep. Default 0.5. */
  partial?: number;
  /** Minimum duration of a rep in ms (noise guard). Default 500. */
  minRepMs?: number;
  /** Time the end position must be held for the rep to be "full". Default 0. */
  holdMs?: number;
}

export interface HoldRule {
  /** Metric threshold that defines the "in position" zone. */
  threshold: number;
  comparator: "gte" | "lte";
  /** Seconds to accumulate for one completed hold. */
  targetSeconds: number;
}

export interface FaultRule {
  id: string;
  /** Text shown on screen and in reports. */
  message: LocalisedText;
  /** Short spoken cue. */
  cue: LocalisedText;
  severity: "minor" | "major";
  /** When the rule is evaluated. "active" = during the movement, "any" = always. */
  phase: "active" | "any";
  test: (f: PoseFrame, side: Side) => boolean;
  /**
   * Landmarks the test relies on. If any is off-screen or barely detected the rule is
   * skipped, so a guessed (hidden) joint never triggers a false cue.
   */
  uses?: (side: Side) => number[];
}

export interface Dose {
  sets: number;
  reps?: number;
  holdSeconds?: number;
  restSeconds: number;
}

export interface ExerciseDefinition {
  id: string;
  name: LocalisedText;
  region: Region;
  /** Secondary tags so plans can filter (e.g. "sciatica", "posture"). */
  tags: string[];
  view: CameraView;
  position: Position;
  kind: ExerciseKind;
  laterality: Laterality;
  summary: LocalisedText;
  setup: LocalisedText;
  steps: LocalisedText[];
  precautions: LocalisedText[];
  /** Landmarks that must be visible to track this exercise. */
  required: (side: Side) => number[];
  metric: MetricDefinition;
  secondary?: SecondaryMetric[];
  reps?: RepRule;
  hold?: HoldRule;
  faults: FaultRule[];
  dose: Dose;
  /** Typical healthy adult range for context only (not a diagnostic threshold). */
  reference?: { value: number; note: string };
  /** Calibration status of the definition's thresholds. */
  calibration: "draft" | "lab-tested" | "clinician-reviewed";
}

/** Threshold overrides produced by the calibration lab or a clinician. */
export interface ExerciseOverrides {
  reps?: Partial<RepRule>;
  hold?: Partial<HoldRule>;
}
