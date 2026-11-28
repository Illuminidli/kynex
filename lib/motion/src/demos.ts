/**
 * Demonstration clips: key poses for an animated 3D figure that shows each exercise
 * before the patient tries it. Renderer-independent (plain joint angles), so the web
 * three.js avatar today (a rigged CC0 human) and a native renderer later all read
 * the same data.
 *
 * Angles are degrees in anatomical terms, positive in the usual clinical direction:
 *  - flex: forward (shoulder/hip raise forward, elbow/knee bend, spine bend forward)
 *  - abd: away from the body to the side
 *  - side / rot (spine, neck): positive = toward the person's LEFT
 *  - ankle: positive = toes pointing down (heels up)
 *  - bodyPitch: 0 upright, +90 face-down (prone), -90 lying on the back (supine)
 *  - shiftZ: whole body moved forward, in cm (e.g. pelvis travelling over the feet)
 *  - ShRot: upper-arm internal rotation (forearm swings across the body when the elbow is bent)
 *  - headFwd: head poked forward (+) or drawn back (-), in cm; elev: shoulder lift in cm
 */
import type { CameraView, LocalisedText } from "./types.ts";

export type DemoJoint =
  | "bodyPitch"
  | "shiftZ"
  | "spineFlex"
  | "spineSide"
  | "spineRot"
  | "neckFlex"
  | "neckSide"
  | "neckRot"
  | "headFwd"
  | "lShFlex"
  | "lShAbd"
  | "lShElev"
  | "lShRot"
  | "lElbow"
  | "rShFlex"
  | "rShAbd"
  | "rShElev"
  | "rShRot"
  | "rElbow"
  | "lHipFlex"
  | "lHipAbd"
  | "lKnee"
  | "lAnkle"
  | "rHipFlex"
  | "rHipAbd"
  | "rKnee"
  | "rAnkle";

export type DemoPose = Partial<Record<DemoJoint, number>>;

/** Body segments that can be highlighted to show what moves. */
export type DemoSegment = "head" | "trunk" | "lArm" | "rArm" | "lLeg" | "rLeg";

export interface DemoKey {
  /** Position in the loop, 0..1. */
  at: number;
  pose: DemoPose;
  /** Caption shown from this key until the next captioned key. */
  cue?: LocalisedText;
}

export interface DemoClip {
  /** Where the camera sits: matches the exercise's tracking view. */
  view: CameraView;
  /** Loop length in seconds. */
  seconds: number;
  /** Pose applied under every key (e.g. seated). */
  base?: DemoPose;
  keys: DemoKey[];
  highlight: DemoSegment[];
  prop?: "chair" | "mat";
}

const t = (en: string, hi: string): LocalisedText => ({ en, hi });

const SEATED: DemoPose = { lHipFlex: 90, rHipFlex: 90, lKnee: 90, rKnee: 90 };
const ARMS_RELAXED: DemoPose = { lShAbd: 6, rShAbd: 6, lElbow: 8, rElbow: 8 };
const ARMS_CROSSED: DemoPose = { lShFlex: 25, rShFlex: 25, lShAbd: 12, rShAbd: 12, lShRot: 80, rShRot: 80, lElbow: 105, rElbow: 105 };

const START = t("Start position", "शुरुआती स्थिति");
const RETURN = t("Slowly come back", "धीरे-धीरे वापस आइए");
const HOLD = t("Hold", "रोकिए");

/** Symmetric there-and-back clip: rest → move → hold → rest. */
function out(pose: DemoPose, cue: LocalisedText, holdFrac = 0.15): DemoKey[] {
  return [
    { at: 0, pose: {}, cue: START },
    { at: 0.12, pose: {} },
    { at: 0.45, pose, cue },
    { at: 0.45 + holdFrac, pose, cue: holdFrac >= 0.2 ? HOLD : undefined },
    { at: 0.62 + holdFrac, pose: {}, cue: RETURN },
    { at: 1, pose: {} },
  ];
}

/** Left side, back to centre, right side, back to centre. */
function both(left: DemoPose, right: DemoPose, cueL: LocalisedText, cueR: LocalisedText): DemoKey[] {
  return [
    { at: 0, pose: {}, cue: START },
    { at: 0.06, pose: {} },
    { at: 0.24, pose: left, cue: cueL },
    { at: 0.32, pose: left },
    { at: 0.47, pose: {}, cue: RETURN },
    { at: 0.53, pose: {} },
    { at: 0.71, pose: right, cue: cueR },
    { at: 0.79, pose: right },
    { at: 0.94, pose: {}, cue: RETURN },
    { at: 1, pose: {} },
  ];
}

const QUADRUPED: DemoPose = {
  bodyPitch: 84,
  lHipFlex: 84,
  rHipFlex: 84,
  lKnee: 90,
  rKnee: 90,
  lShFlex: 84,
  rShFlex: 84,
  lAnkle: 40,
  rAnkle: 40,
  neckFlex: -10,
};
const SUPINE: DemoPose = { bodyPitch: -90, lShAbd: 12, rShAbd: 12 };

export const DEMOS: Record<string, DemoClip> = {
  // ---------- Neck & upper limb ----------
  "neck-rotation": {
    view: "front",
    seconds: 7,
    base: { ...SEATED, ...ARMS_RELAXED, lElbow: 70, rElbow: 70, lShFlex: 20, rShFlex: 20 },
    prop: "chair",
    keys: both({ neckRot: 65 }, { neckRot: -65 }, t("Turn to look over your left shoulder", "बाएँ कंधे के ऊपर देखिए"), t("Now to the right", "अब दाईं ओर")),
    highlight: ["head"],
  },
  "neck-side-bend": {
    view: "front",
    seconds: 7,
    base: { ...SEATED, ...ARMS_RELAXED, lElbow: 70, rElbow: 70, lShFlex: 20, rShFlex: 20 },
    prop: "chair",
    keys: both({ neckSide: 35 }, { neckSide: -35 }, t("Left ear toward left shoulder", "बायाँ कान बाएँ कंधे की ओर"), t("Right ear toward right shoulder", "दायाँ कान दाएँ कंधे की ओर")),
    highlight: ["head"],
  },
  "chin-tuck": {
    view: "side",
    seconds: 5,
    base: { ...SEATED, ...ARMS_RELAXED, lElbow: 70, rElbow: 70, lShFlex: 20, rShFlex: 20 },
    prop: "chair",
    keys: out({ headFwd: -4, neckFlex: 6 }, t("Glide your chin straight back", "ठुड्डी सीधी पीछे खींचिए"), 0.25),
    highlight: ["head"],
  },
  "shoulder-flexion": {
    view: "side",
    seconds: 5,
    base: ARMS_RELAXED,
    keys: out({ lShFlex: 165, lShAbd: 0, lElbow: 0 }, t("Raise your arm forward and up", "बाँह आगे से ऊपर उठाइए"), 0.08),
    highlight: ["lArm"],
  },
  "shoulder-abduction": {
    view: "front",
    seconds: 8,
    base: ARMS_RELAXED,
    keys: both({ lShAbd: 160, lElbow: 0 }, { rShAbd: 160, rElbow: 0 }, t("Raise your left arm out to the side", "बाईं बाँह बगल से ऊपर उठाइए"), t("Now the right arm", "अब दाईं बाँह")),
    highlight: ["lArm", "rArm"],
  },
  "elbow-flexion": {
    view: "front",
    seconds: 6,
    base: ARMS_RELAXED,
    keys: both({ lElbow: 135 }, { rElbow: 135 }, t("Bend your left elbow", "बाईं कोहनी मोड़िए"), t("Now the right elbow", "अब दाईं कोहनी")),
    highlight: ["lArm", "rArm"],
  },
  "shoulder-shrug": {
    view: "front",
    seconds: 4,
    base: ARMS_RELAXED,
    keys: out({ lShElev: 5, rShElev: 5 }, t("Lift your shoulders to your ears", "कंधे कानों की ओर उठाइए"), 0.18),
    highlight: ["lArm", "rArm"],
  },

  // ---------- Spine & core ----------
  "forward-bend": {
    view: "side",
    seconds: 6,
    base: ARMS_RELAXED,
    keys: out({ spineFlex: 95, lShFlex: 85, rShFlex: 85, lShAbd: 0, rShAbd: 0, neckFlex: 10, shiftZ: -6 }, t("Bend forward, let your arms hang", "आगे झुकिए, बाँहें ढीली लटकने दीजिए"), 0.12),
    highlight: ["trunk"],
  },
  "side-bend": {
    view: "front",
    seconds: 7,
    base: ARMS_RELAXED,
    keys: both({ spineSide: 28, lShAbd: 0, rShAbd: 0 }, { spineSide: -28, rShAbd: 0, lShAbd: 0 }, t("Slide your left hand down your leg", "बायाँ हाथ पैर के साथ नीचे सरकाइए"), t("Now to the right", "अब दाईं ओर")),
    highlight: ["trunk"],
  },
  "trunk-rotation": {
    view: "front",
    seconds: 7,
    base: ARMS_CROSSED,
    keys: both({ spineRot: 45, neckRot: 5 }, { spineRot: -45, neckRot: -5 }, t("Turn your chest to the left", "छाती बाईं ओर घुमाइए"), t("Now to the right", "अब दाईं ओर")),
    highlight: ["trunk"],
  },
  "back-extension": {
    view: "side",
    seconds: 5,
    base: { lShFlex: -40, rShFlex: -40, lElbow: 95, rElbow: 95, lShAbd: 12, rShAbd: 12 },
    keys: out({ spineFlex: -22, neckFlex: -10, shiftZ: 3 }, t("Lean back gently over your hands", "हाथों के सहारे धीरे से पीछे झुकिए"), 0.1),
    highlight: ["trunk"],
  },
  "bird-dog": {
    view: "side",
    seconds: 9,
    base: QUADRUPED,
    prop: "mat",
    keys: both(
      { rShFlex: 175, lHipFlex: 0, lKnee: 0, lAnkle: 10 },
      { lShFlex: 175, rHipFlex: 0, rKnee: 0, rAnkle: 10 },
      t("Reach one arm forward and the opposite leg back", "एक बाँह आगे और उल्टा पैर पीछे फैलाइए"),
      t("Switch sides", "दूसरी ओर"),
    ),
    highlight: ["lArm", "rArm", "lLeg", "rLeg"],
  },
  "glute-bridge": {
    view: "side",
    seconds: 6,
    base: { ...SUPINE, lHipFlex: 50, rHipFlex: 50, lKnee: 100, rKnee: 100, lAnkle: 0, rAnkle: 0 },
    prop: "mat",
    keys: out({ bodyPitch: -62, lHipFlex: 4, rHipFlex: 4, lKnee: 92, rKnee: 92, lAnkle: -6, rAnkle: -6, neckFlex: 20 }, t("Squeeze your buttocks and lift your hips", "नितंब कसकर कूल्हे उठाइए"), 0.22),
    highlight: ["trunk", "lLeg", "rLeg"],
  },
  "straight-leg-raise": {
    view: "side",
    seconds: 5,
    base: { ...SUPINE, rHipFlex: 50, rKnee: 100 },
    prop: "mat",
    keys: out({ lHipFlex: 55 }, t("Keep the knee straight and lift the leg", "घुटना सीधा रखकर पैर उठाइए"), 0.1),
    highlight: ["lLeg"],
  },

  // ---------- Lower limb ----------
  "sit-to-stand": {
    view: "side",
    seconds: 6,
    base: ARMS_CROSSED,
    prop: "chair",
    keys: [
      { at: 0, pose: { ...SEATED }, cue: t("Sit tall, feet flat", "सीधे बैठिए, पैर ज़मीन पर") },
      { at: 0.1, pose: { ...SEATED } },
      { at: 0.25, pose: { ...SEATED, spineFlex: 35, lHipFlex: 110, rHipFlex: 110 }, cue: t("Lean forward…", "आगे झुकिए…") },
      { at: 0.45, pose: { shiftZ: 32 }, cue: t("…and stand up tall", "…और सीधे खड़े होइए") },
      { at: 0.58, pose: { shiftZ: 32 } },
      { at: 0.75, pose: { ...SEATED, spineFlex: 35, lHipFlex: 110, rHipFlex: 110 }, cue: t("Sit back down slowly", "धीरे-धीरे वापस बैठिए") },
      { at: 0.9, pose: { ...SEATED } },
      { at: 1, pose: { ...SEATED } },
    ],
    highlight: ["lLeg", "rLeg"],
  },
  squat: {
    view: "front",
    seconds: 5,
    base: { lShAbd: 6, rShAbd: 6, lHipAbd: 8, rHipAbd: 8 },
    keys: out(
      { lHipFlex: 85, rHipFlex: 85, lKnee: 95, rKnee: 95, lAnkle: -22, rAnkle: -22, spineFlex: 25, lShFlex: 80, rShFlex: 80, lShAbd: 0, rShAbd: 0 },
      t("Sit back as if into a chair", "जैसे कुर्सी पर बैठ रहे हों, पीछे बैठिए"),
      0.08,
    ),
    highlight: ["lLeg", "rLeg"],
  },
  "hip-abduction": {
    view: "front",
    seconds: 7,
    base: { lShAbd: 20, rShAbd: 20 },
    keys: both({ lHipAbd: 30, spineSide: -4 }, { rHipAbd: 30, spineSide: 4 }, t("Lift your left leg out to the side", "बायाँ पैर बगल में उठाइए"), t("Now the right leg", "अब दायाँ पैर")),
    highlight: ["lLeg", "rLeg"],
  },
  marching: {
    view: "front",
    seconds: 4,
    base: ARMS_RELAXED,
    keys: both(
      { lHipFlex: 85, lKnee: 90, rShFlex: 25, lShFlex: -15 },
      { rHipFlex: 85, rKnee: 90, lShFlex: 25, rShFlex: -15 },
      t("Lift your left knee", "बायाँ घुटना उठाइए"),
      t("Lift your right knee", "दायाँ घुटना उठाइए"),
    ),
    highlight: ["lLeg", "rLeg"],
  },
  "hip-extension": {
    view: "side",
    seconds: 5,
    base: ARMS_RELAXED,
    keys: out({ lHipFlex: -20, spineFlex: 6 }, t("Take your straight leg back", "सीधा पैर पीछे ले जाइए"), 0.1),
    highlight: ["lLeg"],
  },
  "forward-lunge": {
    view: "side",
    seconds: 6,
    base: { lShAbd: 8, rShAbd: 8 },
    keys: out(
      { lHipFlex: 88, lKnee: 92, lAnkle: -10, rHipFlex: -12, rKnee: 92, rAnkle: 50, shiftZ: 30 },
      t("Step forward and lower your back knee", "आगे कदम रखिए और पिछला घुटना नीचे लाइए"),
      0.1,
    ),
    highlight: ["lLeg", "rLeg"],
  },
  "calf-raise": {
    view: "side",
    seconds: 4,
    base: ARMS_RELAXED,
    keys: out({ lAnkle: 38, rAnkle: 38 }, t("Rise up onto your toes", "पंजों के बल ऊपर उठिए"), 0.15),
    highlight: ["lLeg", "rLeg"],
  },
  "seated-knee-extension": {
    view: "side",
    seconds: 5,
    base: { ...SEATED, ...ARMS_RELAXED, lElbow: 60, rElbow: 60, lShFlex: 20, rShFlex: 20 },
    prop: "chair",
    keys: out({ lKnee: 5, lAnkle: -15 }, t("Straighten your knee fully", "घुटना पूरा सीधा कीजिए"), 0.25),
    highlight: ["lLeg"],
  },
  "hamstring-curl": {
    view: "side",
    seconds: 5,
    base: ARMS_RELAXED,
    keys: out({ lKnee: 95, lAnkle: 20 }, t("Bend your knee, heel toward buttock", "घुटना मोड़कर एड़ी नितंब की ओर"), 0.1),
    highlight: ["lLeg"],
  },
  "single-leg-stance": {
    view: "front",
    seconds: 8,
    base: { lShAbd: 18, rShAbd: 18 },
    keys: [
      { at: 0, pose: {}, cue: START },
      { at: 0.12, pose: { rHipFlex: 40, rKnee: 70 }, cue: t("Lift one foot and balance", "एक पैर उठाकर संतुलन बनाइए") },
      { at: 0.3, pose: { rHipFlex: 40, rKnee: 70, spineSide: 2 } },
      { at: 0.5, pose: { rHipFlex: 40, rKnee: 70, spineSide: -2 }, cue: HOLD },
      { at: 0.7, pose: { rHipFlex: 40, rKnee: 70, spineSide: 1.5 } },
      { at: 0.88, pose: { rHipFlex: 40, rKnee: 70 } },
      { at: 1, pose: {} },
    ],
    highlight: ["lLeg"],
  },
  plank: {
    view: "side",
    seconds: 6,
    base: { bodyPitch: 76, lShFlex: 76, rShFlex: 76, lElbow: 90, rElbow: 90, lAnkle: -14, rAnkle: -14, neckFlex: -12 },
    prop: "mat",
    keys: [
      { at: 0, pose: {}, cue: t("Body in one straight line", "शरीर एक सीधी रेखा में") },
      { at: 0.5, pose: { bodyPitch: 75 }, cue: HOLD },
      { at: 1, pose: {} },
    ],
    highlight: ["trunk"],
  },
};

export function getDemo(id: string): DemoClip | undefined {
  return DEMOS[id];
}

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);

/** Pose at loop position p (0..1), eased between keys, with the clip's base pose underneath. */
export function samplePose(clip: DemoClip, p: number): { pose: DemoPose; cue?: LocalisedText } {
  const keys = clip.keys;
  const x = ((p % 1) + 1) % 1;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]!.at <= x + 1e-6) i++;
  const a = keys[i]!;
  const b = keys[i + 1] ?? a;
  const span = b.at - a.at;
  const k = span > 0 ? ease(Math.min(1, Math.max(0, (x - a.at) / span))) : 0;
  const base = clip.base ?? {};
  const names = new Set<DemoJoint>([...(Object.keys(base) as DemoJoint[]), ...(Object.keys(a.pose) as DemoJoint[]), ...(Object.keys(b.pose) as DemoJoint[])]);
  const pose: DemoPose = {};
  for (const n of names) {
    const va = a.pose[n] ?? base[n] ?? 0;
    const vb = b.pose[n] ?? base[n] ?? 0;
    pose[n] = va + (vb - va) * k;
  }
  // Show the caption of the pose being moved toward, so it appears as the movement starts.
  let cue: LocalisedText | undefined = k > 0 && b.cue ? b.cue : undefined;
  if (!cue) for (let j = 0; j <= i; j++) if (keys[j]!.cue) cue = keys[j]!.cue;
  return { pose, cue };
}
