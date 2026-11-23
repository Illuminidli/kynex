import { facing, img, imgToCm, mid2, tilt, wld, wrap, yaw } from "../geometry.ts";
import { LM } from "../landmarks.ts";
import type { ExerciseDefinition, PoseFrame } from "../types.ts";
import { armElevation, elbowBent, joint, leaningBack, reqBoth, t, trunkSideLean } from "./helpers.ts";

const earsYaw = (f: PoseFrame) => yaw(wld(f, LM.leftEar), wld(f, LM.rightEar));
const shouldersYaw = (f: PoseFrame) => yaw(wld(f, LM.leftShoulder), wld(f, LM.rightShoulder));
const headTilt = (f: PoseFrame) =>
  tilt(img(f, LM.leftEar), img(f, LM.rightEar)) - tilt(img(f, LM.leftShoulder), img(f, LM.rightShoulder));

const headReq = () => [LM.nose, LM.leftEar, LM.rightEar, LM.leftShoulder, LM.rightShoulder];

export const neckRotation: ExerciseDefinition = {
  id: "neck-rotation",
  name: t("Neck rotation", "गर्दन घुमाना"),
  region: "neck",
  tags: ["neck-pain", "posture", "mobility"],
  view: "front",
  position: "seated",
  kind: "reps",
  laterality: "alternating",
  summary: t("Turn your head slowly to look over each shoulder.", "धीरे-धीरे सिर घुमाकर दोनों कंधों के ऊपर देखिए।"),
  setup: t("Sit upright facing the camera, shoulders relaxed.", "कैमरे की ओर मुँह करके सीधे बैठिए, कंधे ढीले रखिए।"),
  steps: [
    t("Look straight ahead and hold still for a moment.", "सीधे सामने देखिए और एक पल स्थिर रहिए।"),
    t("Slowly turn your head to the left as far as is comfortable.", "धीरे-धीरे सिर बाईं ओर जितना आराम से हो उतना घुमाइए।"),
    t("Return to centre, then turn to the right.", "बीच में लौटिए, फिर दाईं ओर घुमाइए।"),
  ],
  precautions: [t("Stop if you feel dizziness, tingling or arm pain.", "चक्कर, झनझनाहट या बाँह में दर्द हो तो रुक जाइए।")],
  required: headReq,
  metric: {
    label: "Neck rotation",
    unit: "deg",
    baselineOf: earsYaw,
    baselineLimit: 25, // must start facing the phone
    compute: (f, side, { baseline }) => {
      const d = wrap(earsYaw(f) - (baseline ?? 0));
      return side === "left" ? Math.max(0, d) : Math.max(0, -d);
    },
  },
  // 50 degrees until the lab sets it (M6): 60 was too strict on a real phone test (best 51).
  reps: { rest: 0, target: 50, minRepMs: 700 },
  faults: [
    {
      id: "shoulders-turning",
      message: t("Shoulders are turning with the head", "सिर के साथ कंधे भी घूम रहे हैं"),
      cue: t("Keep your shoulders still, turn only your head", "कंधे स्थिर रखिए, केवल सिर घुमाइए"),
      severity: "minor",
      phase: "active",
      // 30, not 20: a chair at a slight angle to the phone is not a fault.
      test: (f) => Math.abs(shouldersYaw(f)) > 30,
    },
  ],
  dose: { sets: 2, reps: 8, restSeconds: 30 },
  reference: { value: 80, note: "Typical adult cervical rotation 70-90 degrees each side" },
  calibration: "draft",
};

export const neckSideBend: ExerciseDefinition = {
  id: "neck-side-bend",
  name: t("Neck side bend", "गर्दन बगल में झुकाना"),
  region: "neck",
  tags: ["neck-pain", "posture", "mobility"],
  view: "front",
  position: "seated",
  kind: "reps",
  laterality: "alternating",
  summary: t("Tilt your ear toward each shoulder.", "कान को बारी-बारी से कंधे की ओर झुकाइए।"),
  setup: t("Sit upright facing the camera.", "कैमरे की ओर मुँह करके सीधे बैठिए।"),
  steps: [
    t("Look straight ahead.", "सीधे सामने देखिए।"),
    t("Tilt your left ear toward your left shoulder without lifting the shoulder.", "बायाँ कान बाएँ कंधे की ओर झुकाइए, कंधा ऊपर मत उठाइए।"),
    t("Return to centre and repeat on the right.", "बीच में लौटकर दाईं ओर दोहराइए।"),
  ],
  precautions: [t("Move gently; stop if pain spreads into the arm.", "धीरे चलिए; दर्द बाँह में फैले तो रुकिए।")],
  required: headReq,
  metric: {
    label: "Lateral flexion",
    unit: "deg",
    baselineOf: headTilt,
    baselineLimit: 15, // must start with the head upright
    compute: (f, side, { baseline }) => {
      const d = headTilt(f) - (baseline ?? 0);
      return side === "left" ? Math.max(0, -d) : Math.max(0, d);
    },
  },
  reps: { rest: 0, target: 35, minRepMs: 700 },
  faults: [
    {
      id: "shoulder-hike",
      message: t("Shoulder is lifting", "कंधा ऊपर उठ रहा है"),
      cue: t("Keep your shoulders level", "कंधे बराबर रखिए"),
      severity: "minor",
      phase: "active",
      test: (f) => Math.abs(tilt(img(f, LM.leftShoulder), img(f, LM.rightShoulder))) > 8,
    },
    {
      id: "head-turning",
      message: t("Head is turning instead of tilting", "सिर झुकने की बजाय घूम रहा है"),
      cue: t("Keep looking straight ahead", "सीधे सामने देखते रहिए"),
      severity: "minor",
      phase: "active",
      test: (f) => Math.abs(earsYaw(f)) > 30,
    },
  ],
  dose: { sets: 2, reps: 8, restSeconds: 30 },
  reference: { value: 45, note: "Typical adult cervical lateral flexion 40-45 degrees" },
  calibration: "draft",
};

/** Horizontal ear-ahead-of-shoulder offset in cm (side view, near side). */
function headForwardCm(f: PoseFrame): number {
  const l = (img(f, LM.leftEar).x - img(f, LM.leftShoulder).x) * facing(f);
  const r = (img(f, LM.rightEar).x - img(f, LM.rightShoulder).x) * facing(f);
  const lv = (f.image[LM.leftEar]?.visibility ?? 0) + (f.image[LM.leftShoulder]?.visibility ?? 0);
  const rv = (f.image[LM.rightEar]?.visibility ?? 0) + (f.image[LM.rightShoulder]?.visibility ?? 0);
  return imgToCm(f, lv >= rv ? l : r);
}

export const chinTuck: ExerciseDefinition = {
  id: "chin-tuck",
  name: t("Chin tuck", "ठुड्डी अंदर करना"),
  region: "neck",
  tags: ["neck-pain", "posture", "text-neck"],
  view: "side",
  position: "seated",
  kind: "reps",
  laterality: "bilateral",
  summary: t("Glide your head straight back to make a double chin.", "सिर को सीधा पीछे खिसकाकर डबल-चिन बनाइए।"),
  setup: t("Sit upright side-on to the camera.", "कैमरे की ओर बगल से सीधे बैठिए।"),
  steps: [
    t("Keep your eyes level.", "आँखें सीधी रखिए।"),
    t("Slide your chin straight back, hold for 2 seconds.", "ठुड्डी को सीधा पीछे खिसकाइए, 2 सेकंड रुकिए।"),
    t("Relax forward and repeat.", "आराम से आगे आइए और दोहराइए।"),
  ],
  precautions: [t("This should feel like a stretch, not pain.", "खिंचाव महसूस होना चाहिए, दर्द नहीं।")],
  required: () => [LM.nose, LM.leftEar, LM.rightEar, LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip],
  metric: {
    label: "Head retraction",
    unit: "cm",
    baselineOf: (f) => headForwardCm(f),
    compute: (f, _s, { baseline }) => (baseline ?? 0) - headForwardCm(f),
  },
  reps: { rest: 0, target: 3, holdMs: 1500, minRepMs: 900 },
  faults: [
    {
      id: "looking-down",
      message: t("Chin is dropping down", "ठुड्डी नीचे झुक रही है"),
      cue: t("Keep your eyes level and slide straight back", "आँखें सीधी रखकर सीधा पीछे खिसकाइए"),
      severity: "minor",
      phase: "active",
      test: (f) => {
        const ear = mid2(img(f, LM.leftEar), img(f, LM.rightEar));
        const nose = img(f, LM.nose);
        const ang = (Math.atan2(nose.y - ear.y, Math.abs(nose.x - ear.x)) * 180) / Math.PI;
        return ang > 32;
      },
    },
  ],
  dose: { sets: 2, reps: 10, restSeconds: 30 },
  calibration: "draft",
};

export const shoulderFlexion: ExerciseDefinition = {
  id: "shoulder-flexion",
  name: t("Shoulder flexion (front raise)", "कंधा आगे उठाना"),
  region: "shoulder",
  tags: ["shoulder", "mobility", "posture"],
  view: "side",
  position: "standing",
  kind: "reps",
  laterality: "unilateral",
  summary: t("Raise your straight arm forward and up overhead.", "सीधी बाँह को आगे से ऊपर सिर तक उठाइए।"),
  setup: t("Stand side-on to the camera with the working arm nearest the camera.", "कैमरे की ओर बगल से खड़े होइए, काम करने वाली बाँह कैमरे के पास रहे।"),
  steps: [
    t("Arm by your side, thumb pointing forward.", "बाँह बगल में, अँगूठा आगे की ओर।"),
    t("Raise the arm forward and up as high as is comfortable.", "बाँह को आगे से जितना आराम से हो ऊपर उठाइए।"),
    t("Lower slowly.", "धीरे-धीरे नीचे लाइए।"),
  ],
  precautions: [t("Stop before any sharp pain in the shoulder.", "कंधे में तेज़ दर्द से पहले रुक जाइए।")],
  required: (s) => [LM[`${s}Shoulder`], LM[`${s}Elbow`], LM[`${s}Wrist`], LM[`${s}Hip`]],
  metric: { label: "Shoulder flexion", unit: "deg", compute: (f, s) => armElevation(f, s) },
  reps: { rest: 30, target: 150 },
  faults: [elbowBent(140), leaningBack(12)],
  dose: { sets: 2, reps: 10, restSeconds: 45 },
  reference: { value: 180, note: "Typical adult shoulder flexion 160-180 degrees" },
  calibration: "draft",
};

export const shoulderAbduction: ExerciseDefinition = {
  id: "shoulder-abduction",
  name: t("Shoulder abduction (side raise)", "कंधा बगल से उठाना"),
  region: "shoulder",
  tags: ["shoulder", "mobility"],
  view: "front",
  position: "standing",
  kind: "reps",
  laterality: "alternating",
  summary: t("Raise your straight arms out to the side.", "सीधी बाँहों को बगल से ऊपर उठाइए।"),
  setup: t("Stand facing the camera, arms by your sides.", "कैमरे की ओर मुँह करके खड़े होइए, बाँहें बगल में।"),
  steps: [
    t("Raise one or both arms out to the side, palms forward.", "एक या दोनों बाँहें बगल से उठाइए, हथेलियाँ आगे।"),
    t("Go as high as is comfortable.", "जितना आराम से हो उतना ऊपर ले जाइए।"),
    t("Lower slowly.", "धीरे-धीरे नीचे लाइए।"),
  ],
  precautions: [t("Avoid shrugging; stop if there is a painful catch.", "कंधे उचकाइए मत; अटकने वाला दर्द हो तो रुकिए।")],
  required: reqBoth("Shoulder", "Elbow", "Wrist", "Hip"),
  metric: { label: "Shoulder abduction", unit: "deg", compute: (f, s) => armElevation(f, s) },
  reps: { rest: 30, target: 150 },
  faults: [elbowBent(140), trunkSideLean(10)],
  dose: { sets: 2, reps: 10, restSeconds: 45 },
  reference: { value: 180, note: "Typical adult shoulder abduction 170-180 degrees" },
  calibration: "draft",
};

export const elbowFlexion: ExerciseDefinition = {
  id: "elbow-flexion",
  name: t("Elbow curl", "कोहनी मोड़ना"),
  region: "elbow",
  tags: ["strength", "upper-limb"],
  view: "front",
  position: "standing",
  kind: "reps",
  laterality: "alternating",
  summary: t("Bend your elbow to bring the hand to the shoulder.", "कोहनी मोड़कर हाथ को कंधे तक लाइए।"),
  setup: t("Stand facing the camera, elbows by your sides. A light water bottle is fine.", "कैमरे की ओर मुँह करके खड़े होइए, कोहनियाँ बगल में। हल्की पानी की बोतल ले सकते हैं।"),
  steps: [
    t("Keep your upper arm still.", "ऊपरी बाँह स्थिर रखिए।"),
    t("Bend the elbow fully, then lower slowly.", "कोहनी पूरी मोड़िए, फिर धीरे से सीधी कीजिए।"),
  ],
  precautions: [t("Use a weight only if your clinician approved it.", "वज़न तभी लीजिए जब डॉक्टर ने अनुमति दी हो।")],
  required: reqBoth("Shoulder", "Elbow", "Wrist", "Hip"),
  metric: { label: "Elbow flexion", unit: "deg", compute: (f, s) => joint(f, s, "Shoulder", "Elbow", "Wrist") },
  reps: { rest: 155, target: 55 },
  faults: [
    {
      id: "elbow-drifting",
      message: t("Upper arm is swinging", "ऊपरी बाँह हिल रही है"),
      cue: t("Keep your elbow by your side", "कोहनी बगल में रखिए"),
      severity: "minor",
      phase: "active",
      test: (f, s) => (armElevation(f, s) ?? 0) > 35,
    },
  ],
  dose: { sets: 2, reps: 12, restSeconds: 45 },
  calibration: "draft",
};

/** Mean vertical ear-to-shoulder gap in cm (front view). */
function earShoulderGapCm(f: PoseFrame): number {
  const l = img(f, LM.leftShoulder).y - img(f, LM.leftEar).y;
  const r = img(f, LM.rightShoulder).y - img(f, LM.rightEar).y;
  return imgToCm(f, (l + r) / 2);
}

export const shoulderShrug: ExerciseDefinition = {
  id: "shoulder-shrug",
  name: t("Shoulder shrug", "कंधे उचकाना"),
  region: "shoulder",
  tags: ["neck-pain", "posture", "tension"],
  view: "front",
  position: "standing",
  kind: "reps",
  laterality: "bilateral",
  summary: t("Lift both shoulders toward your ears, hold, and relax.", "दोनों कंधे कानों की ओर उठाइए, रुकिए, फिर ढीले छोड़िए।"),
  setup: t("Stand or sit facing the camera, arms relaxed.", "कैमरे की ओर मुँह करके खड़े या बैठिए, बाँहें ढीली।"),
  steps: [
    t("Lift both shoulders straight up.", "दोनों कंधे सीधे ऊपर उठाइए।"),
    t("Hold for a second, then let them drop slowly.", "एक सेकंड रुकिए, फिर धीरे से नीचे छोड़िए।"),
  ],
  precautions: [t("Keep your neck relaxed.", "गर्दन ढीली रखिए।")],
  required: headReq,
  metric: {
    label: "Shoulder elevation",
    unit: "cm",
    baselineOf: (f) => earShoulderGapCm(f),
    compute: (f, _s, { baseline }) => (baseline ?? 0) - earShoulderGapCm(f),
  },
  reps: { rest: 0, target: 3, holdMs: 700, minRepMs: 700 },
  faults: [trunkSideLean(10)],
  dose: { sets: 2, reps: 12, restSeconds: 30 },
  calibration: "draft",
};

export const neckUpperExercises = [
  neckRotation,
  neckSideBend,
  chinTuck,
  shoulderFlexion,
  shoulderAbduction,
  elbowFlexion,
  shoulderShrug,
];

