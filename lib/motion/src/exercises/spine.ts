import { img, imgToCm, mid2, tilt, wld, wrap, yaw } from "../geometry.ts";
import { LM, otherSide, type Side } from "../landmarks.ts";
import type { ExerciseDefinition, PoseFrame } from "../types.ts";
import { armElevation, bothKneesBent, joint, kneeBent, req, reqBoth, t, trunkForward, trunkLean } from "./helpers.ts";

const shouldersYaw = (f: PoseFrame) => yaw(wld(f, LM.leftShoulder), wld(f, LM.rightShoulder));
const hipsYaw = (f: PoseFrame) => yaw(wld(f, LM.leftHip), wld(f, LM.rightHip));

export const forwardBend: ExerciseDefinition = {
  id: "forward-bend",
  name: t("Standing forward bend (toe reach)", "खड़े होकर आगे झुकना"),
  region: "spine",
  tags: ["back-pain", "sciatica", "hamstring", "mobility", "assessment"],
  view: "side",
  position: "standing",
  kind: "reps",
  laterality: "bilateral",
  summary: t(
    "Bend forward from the hips and reach toward your toes. Kynex measures how close your fingertips get to the floor.",
    "कूल्हों से आगे झुककर पैरों की उँगलियों की ओर पहुँचिए। Kynex मापता है कि उँगलियाँ ज़मीन के कितने पास पहुँचीं।",
  ),
  setup: t("Stand side-on to the camera, feet hip-width apart. Your whole body must be visible.", "कैमरे की ओर बगल से खड़े होइए, पैर कूल्हे जितनी दूरी पर। पूरा शरीर दिखना चाहिए।"),
  steps: [
    t("Stand tall with arms by your sides.", "सीधे खड़े होइए, बाँहें बगल में।"),
    t("Slowly bend forward and let your hands reach toward your toes.", "धीरे-धीरे आगे झुकिए और हाथों को पैरों की ओर ले जाइए।"),
    t("Pause at your comfortable limit, then roll back up slowly.", "आराम की सीमा पर रुकिए, फिर धीरे से ऊपर आइए।"),
  ],
  precautions: [
    t("Stop if pain travels down your leg or you feel numbness.", "दर्द पैर में नीचे जाए या सुन्नपन लगे तो रुक जाइए।"),
    t("Do not bounce.", "झटके मत दीजिए।"),
  ],
  required: req("Shoulder", "Hip", "Knee", "Ankle", "Index", "FootIndex", "Heel"),
  metric: {
    label: "Hip flexion",
    unit: "deg",
    compute: (f, s) => {
      const a = joint(f, s, "Shoulder", "Hip", "Knee");
      return a === null ? null : 180 - a;
    },
  },
  secondary: [
    {
      id: "fingertip-to-floor",
      label: "Fingertip-to-floor distance",
      unit: "cm",
      keep: "min",
      compute: (f, s) => {
        const floor = Math.max(img(f, LM[`${s}Heel`]).y, img(f, LM[`${s}FootIndex`]).y);
        return imgToCm(f, floor - img(f, LM[`${s}Index`]).y);
      },
    },
  ],
  reps: { rest: 15, target: 90, holdMs: 800, minRepMs: 1200 },
  faults: [kneeBent(150)],
  dose: { sets: 2, reps: 6, restSeconds: 45 },
  reference: { value: 0, note: "Fingertip-to-floor of 0 cm = touching the floor" },
  calibration: "draft",
};

export const sideBend: ExerciseDefinition = {
  id: "side-bend",
  name: t("Standing side bend", "खड़े होकर बगल में झुकना"),
  region: "spine",
  tags: ["back-pain", "mobility", "scoliosis"],
  view: "front",
  position: "standing",
  kind: "reps",
  laterality: "alternating",
  summary: t("Slide your hand down the side of your leg to bend sideways.", "हाथ को पैर के किनारे नीचे सरकाते हुए बगल में झुकिए।"),
  setup: t("Stand facing the camera, feet hip-width apart.", "कैमरे की ओर मुँह करके खड़े होइए, पैर कूल्हे जितनी दूरी पर।"),
  steps: [
    t("Stand tall and still for a moment.", "सीधे खड़े होकर एक पल स्थिर रहिए।"),
    t("Bend to the left, sliding your hand down your thigh.", "बाईं ओर झुकिए, हाथ जाँघ पर नीचे सरकाइए।"),
    t("Return to upright and bend to the right.", "सीधे लौटिए और दाईं ओर झुकिए।"),
  ],
  precautions: [t("Bend straight to the side, not forward.", "सीधा बगल में झुकिए, आगे नहीं।")],
  required: reqBoth("Shoulder", "Hip", "Knee", "Ankle"),
  metric: {
    label: "Lateral trunk flexion",
    unit: "deg",
    baselineOf: (f) => trunkLean(f),
    compute: (f, side, { baseline }) => {
      // Facing the camera the person's left is on the image right, so a positive lean = bending left.
      const d = trunkLean(f) - (baseline ?? 0);
      return side === "left" ? Math.max(0, d) : Math.max(0, -d);
    },
  },
  reps: { rest: 0, target: 30, minRepMs: 800 },
  faults: [
    bothKneesBent(155),
    {
      id: "twisting",
      message: t("Twisting instead of bending sideways", "बगल में झुकने की बजाय मुड़ रहे हैं"),
      cue: t("Bend straight to the side, don't twist", "सीधा बगल में झुकिए, मुड़िए मत"),
      severity: "minor",
      phase: "active",
      test: (f) => Math.abs(shouldersYaw(f)) > 22,
    },
  ],
  dose: { sets: 2, reps: 8, restSeconds: 30 },
  reference: { value: 30, note: "Typical adult lateral trunk flexion 25-35 degrees" },
  calibration: "draft",
};

export const trunkRotation: ExerciseDefinition = {
  id: "trunk-rotation",
  name: t("Standing trunk rotation", "खड़े होकर धड़ घुमाना"),
  region: "spine",
  tags: ["back-pain", "mobility", "thoracic"],
  view: "front",
  position: "standing",
  kind: "reps",
  laterality: "alternating",
  summary: t("Cross your arms on your chest and turn your upper body side to side.", "बाँहें छाती पर क्रॉस करके ऊपरी शरीर को दोनों ओर घुमाइए।"),
  setup: t("Stand facing the camera, arms crossed over your chest.", "कैमरे की ओर मुँह करके खड़े होइए, बाँहें छाती पर क्रॉस।"),
  steps: [
    t("Keep your hips facing the camera.", "कूल्हे कैमरे की ओर रखिए।"),
    t("Turn your shoulders to one side, then the other.", "कंधों को एक ओर घुमाइए, फिर दूसरी ओर।"),
  ],
  precautions: [t("Move slowly and within a pain-free range.", "धीरे और बिना दर्द की सीमा में चलिए।")],
  required: reqBoth("Shoulder", "Hip"),
  metric: {
    label: "Trunk rotation",
    unit: "deg",
    baselineOf: (f) => wrap(shouldersYaw(f) - hipsYaw(f)),
    compute: (f, side, { baseline }) => {
      const d = wrap(shouldersYaw(f) - hipsYaw(f) - (baseline ?? 0));
      return side === "left" ? Math.max(0, d) : Math.max(0, -d);
    },
  },
  reps: { rest: 0, target: 40, minRepMs: 800 },
  faults: [
    {
      id: "hips-turning",
      message: t("Hips are turning", "कूल्हे घूम रहे हैं"),
      cue: t("Keep your hips facing forward", "कूल्हे सामने की ओर रखिए"),
      severity: "minor",
      phase: "active",
      test: (f) => Math.abs(hipsYaw(f)) > 18,
    },
  ],
  dose: { sets: 2, reps: 8, restSeconds: 30 },
  calibration: "draft",
};

export const backExtension: ExerciseDefinition = {
  id: "back-extension",
  name: t("Standing back extension", "खड़े होकर पीछे झुकना"),
  region: "spine",
  tags: ["back-pain", "disc", "posture", "mckenzie"],
  view: "side",
  position: "standing",
  kind: "reps",
  laterality: "bilateral",
  summary: t("Hands on your lower back, gently lean backwards.", "हाथ कमर पर रखकर धीरे से पीछे झुकिए।"),
  setup: t("Stand side-on to the camera, hands on your lower back.", "कैमरे की ओर बगल से खड़े होइए, हाथ कमर पर।"),
  steps: [
    t("Stand tall and still for a moment.", "सीधे खड़े होकर एक पल स्थिर रहिए।"),
    t("Lean back from the waist, supporting with your hands.", "हाथों के सहारे कमर से पीछे झुकिए।"),
    t("Return to upright.", "सीधे लौटिए।"),
  ],
  precautions: [t("Stop if leg pain increases or spreads.", "पैर का दर्द बढ़े या फैले तो रुकिए।")],
  required: req("Shoulder", "Hip", "Knee", "Ankle"),
  metric: {
    label: "Trunk extension",
    unit: "deg",
    baselineOf: (f) => -trunkForward(f),
    compute: (f, _s, { baseline }) => -trunkForward(f) - (baseline ?? 0),
  },
  reps: { rest: 0, target: 20, minRepMs: 800 },
  faults: [kneeBent(150)],
  dose: { sets: 2, reps: 10, restSeconds: 30 },
  calibration: "draft",
};

export const birdDog: ExerciseDefinition = {
  id: "bird-dog",
  name: t("Bird dog", "बर्ड डॉग"),
  region: "core",
  tags: ["back-pain", "core", "stability"],
  view: "side",
  position: "quadruped",
  kind: "reps",
  laterality: "alternating",
  summary: t("On hands and knees, reach one arm forward and the opposite leg back.", "हाथों और घुटनों के बल, एक बाँह आगे और विपरीत पैर पीछे फैलाइए।"),
  setup: t("Get on hands and knees side-on to the camera, back flat.", "कैमरे की ओर बगल से हाथों-घुटनों के बल आइए, पीठ सीधी।"),
  steps: [
    t("Brace your stomach gently.", "पेट को हल्का कसिए।"),
    t("Reach your right arm forward and left leg back. Hold 2 seconds.", "दाईं बाँह आगे और बायाँ पैर पीछे फैलाइए। 2 सेकंड रुकिए।"),
    t("Return and switch sides.", "वापस आइए और बदलिए।"),
  ],
  precautions: [t("Keep your back flat; don't let your hips rotate.", "पीठ सीधी रखिए; कूल्हे घूमने न दें।")],
  required: (s: Side) => [
    LM.leftShoulder,
    LM.rightShoulder,
    LM.leftHip,
    LM.rightHip,
    LM[`${otherSide(s)}Elbow`],
    LM[`${s}Knee`],
  ],
  metric: {
    // side = the leg that lifts; the opposite arm reaches.
    label: "Limb extension",
    unit: "deg",
    compute: (f, s) => {
      const arm = armElevation(f, otherSide(s));
      const leg = joint(f, s, "Shoulder", "Hip", "Knee");
      if (arm === null || leg === null) return null;
      return Math.min(arm, leg);
    },
  },
  reps: { rest: 100, target: 160, holdMs: 1500, minRepMs: 1200 },
  faults: [
    {
      id: "back-not-flat",
      message: t("Back is not level", "पीठ सीधी नहीं है"),
      cue: t("Keep your back flat like a table", "पीठ मेज़ की तरह सीधी रखिए"),
      severity: "minor",
      phase: "active",
      test: (f) => {
        const sh = mid2(img(f, LM.leftShoulder), img(f, LM.rightShoulder));
        const hp = mid2(img(f, LM.leftHip), img(f, LM.rightHip));
        return Math.abs(tilt(sh, hp)) > 20;
      },
    },
  ],
  dose: { sets: 2, reps: 6, restSeconds: 45 },
  calibration: "draft",
};

export const gluteBridge: ExerciseDefinition = {
  id: "glute-bridge",
  name: t("Glute bridge", "ग्लूट ब्रिज"),
  region: "hip",
  tags: ["back-pain", "glutes", "strength"],
  view: "side",
  position: "supine",
  kind: "reps",
  laterality: "bilateral",
  summary: t("Lying on your back with knees bent, lift your hips.", "पीठ के बल लेटकर घुटने मोड़िए और कूल्हे ऊपर उठाइए।"),
  setup: t("Lie on your back side-on to the camera, knees bent, feet flat.", "कैमरे की ओर बगल से पीठ के बल लेटिए, घुटने मुड़े, पैर ज़मीन पर।"),
  steps: [
    t("Squeeze your buttocks and lift your hips until body is in a line from shoulders to knees.", "नितंब कसकर कूल्हे उठाइए जब तक कंधों से घुटनों तक सीधी रेखा न बने।"),
    t("Hold for 2 seconds, then lower slowly.", "2 सेकंड रुकिए, फिर धीरे से नीचे आइए।"),
  ],
  precautions: [t("Don't over-arch your lower back.", "कमर को ज़्यादा मत मोड़िए।")],
  required: req("Shoulder", "Hip", "Knee", "Ankle"),
  metric: { label: "Hip extension", unit: "deg", compute: (f, s) => joint(f, s, "Shoulder", "Hip", "Knee") },
  reps: { rest: 125, target: 168, holdMs: 1500, minRepMs: 1200 },
  faults: [
    {
      id: "heel-lift",
      message: t("Heels are lifting", "एड़ियाँ उठ रही हैं"),
      cue: t("Keep your feet flat", "पैर ज़मीन पर सपाट रखिए"),
      severity: "minor",
      phase: "active",
      test: (f, s) => imgToCm(f, img(f, LM[`${s}FootIndex`]).y - img(f, LM[`${s}Heel`]).y) > 4,
    },
  ],
  dose: { sets: 2, reps: 10, restSeconds: 45 },
  calibration: "draft",
};

export const straightLegRaise: ExerciseDefinition = {
  id: "straight-leg-raise",
  name: t("Straight leg raise", "सीधा पैर उठाना"),
  region: "hip",
  tags: ["sciatica", "back-pain", "knee", "strength", "assessment"],
  view: "side",
  position: "supine",
  kind: "reps",
  laterality: "unilateral",
  summary: t("Lying on your back, lift one straight leg.", "पीठ के बल लेटकर एक सीधा पैर उठाइए।"),
  setup: t("Lie on your back side-on to the camera, working leg nearest the camera. Bend the other knee.", "कैमरे की ओर बगल से पीठ के बल लेटिए, काम करने वाला पैर कैमरे के पास। दूसरा घुटना मोड़िए।"),
  steps: [
    t("Tighten the thigh of the straight leg.", "सीधे पैर की जाँघ कसिए।"),
    t("Lift the leg slowly to the height of the other knee or as comfortable.", "पैर को धीरे-धीरे दूसरे घुटने की ऊँचाई तक उठाइए।"),
    t("Lower slowly.", "धीरे से नीचे लाइए।"),
  ],
  precautions: [t("Stop if you feel shooting pain down the leg.", "पैर में तेज़ चुभने वाला दर्द हो तो रुकिए।")],
  required: req("Shoulder", "Hip", "Knee", "Ankle"),
  metric: {
    label: "Hip flexion",
    unit: "deg",
    compute: (f, s) => {
      const a = joint(f, s, "Shoulder", "Hip", "Knee");
      return a === null ? null : 180 - a;
    },
  },
  reps: { rest: 5, target: 55, minRepMs: 900 },
  faults: [
    {
      id: "knee-bent",
      message: t("Knee is bending", "घुटना मुड़ रहा है"),
      cue: t("Keep the knee straight", "घुटना सीधा रखिए"),
      severity: "major",
      phase: "active",
      test: (f, s) => (joint(f, s, "Hip", "Knee", "Ankle") ?? 180) < 160,
    },
  ],
  dose: { sets: 2, reps: 10, restSeconds: 45 },
  reference: { value: 70, note: "Typical pain-free straight leg raise 70-90 degrees" },
  calibration: "draft",
};

export const spineExercises = [forwardBend, sideBend, trunkRotation, backExtension, birdDog, gluteBridge, straightLegRaise];

