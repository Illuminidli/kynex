import { angle3, facing, finite, fromVertical, img, imgS, mid2, mid3, signedLean, tilt, wld, wldS } from "../geometry.ts";
import { idx, LM, otherSide, type Side, type SidedJoint } from "../landmarks.ts";
import type { FaultRule, LocalisedText, PoseFrame } from "../types.ts";

export const t = (en: string, hi: string): LocalisedText => ({ en, hi });

/** Landmark ids for the given joints on one side. */
export const req =
  (...joints: SidedJoint[]) =>
  (side: Side): number[] =>
    joints.map((j) => idx(side, j));

/** Landmark ids for the given joints on both sides. */
export const reqBoth =
  (...joints: SidedJoint[]) =>
  (): number[] =>
    joints.flatMap((j) => [idx("left", j), idx("right", j)]);

/** 3D joint angle a-b-c on one side using world landmarks. */
export function joint(f: PoseFrame, side: Side, a: SidedJoint, b: SidedJoint, c: SidedJoint): number | null {
  return finite(angle3(wldS(f, side, a), wldS(f, side, b), wldS(f, side, c)));
}

/**
 * Arm elevation: angle between the upper arm (shoulder -> elbow) and the trunk midline
 * (shoulder-mid -> hip-mid), in 3D. 0 = arm by the side, 180 = straight overhead.
 * Clinically this is the reference for shoulder flexion/abduction goniometry.
 */
export function armElevation(f: PoseFrame, side: Side): number | null {
  const sh = wldS(f, side, "Shoulder");
  const el = wldS(f, side, "Elbow");
  const sm = mid3(wld(f, LM.leftShoulder), wld(f, LM.rightShoulder));
  const hm = mid3(wld(f, LM.leftHip), wld(f, LM.rightHip));
  const down = { x: sh.x + (hm.x - sm.x), y: sh.y + (hm.y - sm.y), z: sh.z + (hm.z - sm.z) };
  return finite(angle3(el, sh, down));
}

export const mean = (...xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Trunk (hip-mid -> shoulder-mid) inclination from vertical in the image, degrees. */
export function trunkFromVertical(f: PoseFrame): number {
  const s = mid2(img(f, LM.leftShoulder), img(f, LM.rightShoulder));
  const h = mid2(img(f, LM.leftHip), img(f, LM.rightHip));
  return fromVertical(h, s);
}

/** Trunk lean in the image, signed, degrees (positive = shoulders toward image right). */
export function trunkLean(f: PoseFrame): number {
  const s = mid2(img(f, LM.leftShoulder), img(f, LM.rightShoulder));
  const h = mid2(img(f, LM.leftHip), img(f, LM.rightHip));
  return signedLean(h, s);
}

/**
 * Side-view trunk lean relative to the direction the person faces.
 * Positive = leaning forward, negative = leaning back.
 */
export function trunkForward(f: PoseFrame): number {
  return trunkLean(f) * facing(f);
}

/** Side-view inclination of a segment (from -> to) relative to facing. Positive = toward the front. */
export function segmentForward(f: PoseFrame, from: number, to: number): number {
  return signedLean(img(f, from), img(f, to)) * facing(f);
}

export function shoulderTilt(f: PoseFrame): number {
  return tilt(img(f, LM.leftShoulder), img(f, LM.rightShoulder));
}

export function hipMid3(f: PoseFrame) {
  return mid3(wld(f, LM.leftHip), wld(f, LM.rightHip));
}

export { imgS, wldS, otherSide };

/* ---------------- Re-usable fault rules ---------------- */

export const elbowBent = (minDeg = 145): FaultRule => ({
  id: "elbow-bent",
  message: t("Elbow is bending", "कोहनी मुड़ रही है"),
  cue: t("Keep your elbow straight", "कोहनी सीधी रखिए"),
  severity: "minor",
  phase: "active",
  test: (f, s) => (joint(f, s, "Shoulder", "Elbow", "Wrist") ?? 180) < minDeg,
  uses: req("Shoulder", "Elbow", "Wrist"),
});

export const kneeBent = (minDeg = 155): FaultRule => ({
  id: "knee-bent",
  message: t("Knee is bending", "घुटना मुड़ रहा है"),
  cue: t("Keep your knee straight", "घुटना सीधा रखिए"),
  severity: "minor",
  phase: "active",
  test: (f, s) => (joint(f, s, "Hip", "Knee", "Ankle") ?? 180) < minDeg,
  uses: req("Hip", "Knee", "Ankle"),
});

export const bothKneesBent = (minDeg = 155): FaultRule => ({
  id: "knees-bent",
  message: t("Knees are bending", "घुटने मुड़ रहे हैं"),
  cue: t("Keep your knees straight", "घुटने सीधे रखिए"),
  severity: "minor",
  phase: "active",
  test: (f) =>
    (joint(f, "left", "Hip", "Knee", "Ankle") ?? 180) < minDeg ||
    (joint(f, "right", "Hip", "Knee", "Ankle") ?? 180) < minDeg,
  uses: reqBoth("Hip", "Knee", "Ankle"),
});

export const trunkSideLean = (maxDeg = 10): FaultRule => ({
  id: "trunk-side-lean",
  message: t("Body is leaning to the side", "शरीर एक तरफ़ झुक रहा है"),
  cue: t("Stay tall, don't lean", "सीधे खड़े रहिए, झुकिए मत"),
  severity: "minor",
  phase: "active",
  test: (f) => Math.abs(trunkLean(f)) > maxDeg,
});

export const leaningBack = (maxDeg = 12): FaultRule => ({
  id: "leaning-back",
  message: t("Leaning backwards", "पीछे की ओर झुक रहे हैं"),
  cue: t("Don't lean back, keep your ribs down", "पीछे मत झुकिए, पसलियाँ नीचे रखिए"),
  severity: "minor",
  phase: "active",
  test: (f) => trunkForward(f) < -maxDeg,
});

export const leaningForward = (maxDeg = 20): FaultRule => ({
  id: "leaning-forward",
  message: t("Leaning too far forward", "बहुत आगे झुक रहे हैं"),
  cue: t("Keep your chest up", "छाती ऊपर रखिए"),
  severity: "minor",
  phase: "active",
  test: (f) => trunkForward(f) > maxDeg,
});

export { trunkFromVertical as trunkInclination };
