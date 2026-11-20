/**
 * BlazePose / MediaPipe Pose Landmarker 33-point topology.
 * "left"/"right" are from the person's own perspective (not the viewer's).
 */
export const LM = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export type LandmarkName = keyof typeof LM;
export type Side = "left" | "right";

export const otherSide = (s: Side): Side => (s === "left" ? "right" : "left");

/** Joint names that exist on both sides of the body. */
export type SidedJoint =
  | "Ear"
  | "Shoulder"
  | "Elbow"
  | "Wrist"
  | "Index"
  | "Hip"
  | "Knee"
  | "Ankle"
  | "Heel"
  | "FootIndex";

/** Resolve a sided joint (e.g. "Knee") to a landmark index for a given side. */
export function idx(side: Side, joint: SidedJoint): number {
  return LM[`${side}${joint}` as LandmarkName];
}

/** Skeleton edges used for drawing overlays. */
export const SKELETON: ReadonlyArray<readonly [number, number]> = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
  [LM.leftAnkle, LM.leftHeel],
  [LM.leftHeel, LM.leftFootIndex],
  [LM.leftAnkle, LM.leftFootIndex],
  [LM.rightAnkle, LM.rightHeel],
  [LM.rightHeel, LM.rightFootIndex],
  [LM.rightAnkle, LM.rightFootIndex],
  [LM.leftEar, LM.leftEye],
  [LM.rightEar, LM.rightEye],
  [LM.leftEye, LM.nose],
  [LM.rightEye, LM.nose],
];
