import { dist2, facing, fromVertical, img, imgToCm, mid2, torso2 } from "../geometry.ts";
import { LM, otherSide } from "../landmarks.ts";
import type { ExerciseDefinition, PoseFrame } from "../types.ts";
import {
  joint,
  kneeBent,
  leaningBack,
  leaningForward,
  mean,
  req,
  reqBoth,
  segmentForward,
  t,
  trunkSideLean,
} from "./helpers.ts";

export const sitToStand: ExerciseDefinition = {
  id: "sit-to-stand",
  name: t("Sit to stand", "बैठकर खड़े होना"),
  region: "knee",
  tags: ["strength", "function", "elderly", "assessment"],
  view: "side",
  position: "seated",
  kind: "reps",
  laterality: "bilateral",
  summary: t("Stand up from a chair and sit back down with control.", "कुर्सी से खड़े होइए और नियंत्रण से वापस बैठिए।"),
  setup: t("Sit on a firm chair side-on to the camera, feet flat, arms crossed.", "मज़बूत कुर्सी पर कैमरे की ओर बगल से बैठिए, पैर ज़मीन पर, बाँहें क्रॉस।"),
  steps: [
    t("Lean forward slightly and stand up fully.", "थोड़ा आगे झुककर पूरा खड़े होइए।"),
    t("Sit back down slowly.", "धीरे-धीरे वापस बैठिए।"),
  ],
  precautions: [t("Use a stable chair against a wall. Keep a support nearby if your balance is poor.", "दीवार से सटी स्थिर कुर्सी लीजिए। संतुलन कमज़ोर हो तो पास में सहारा रखिए।")],
  required: req("Shoulder", "Hip", "Knee", "Ankle"),
  metric: { label: "Knee extension", unit: "deg", compute: (f, s) => joint(f, s, "Hip", "Knee", "Ankle") },
  reps: { rest: 100, target: 165, minRepMs: 900 },
  faults: [
    {
      id: "pushing-on-legs",
      message: t("Pushing up with the hands", "हाथों से धक्का देकर उठ रहे हैं"),
      cue: t("Try to stand without pushing on your legs", "पैरों पर हाथ से धक्का दिए बिना खड़े होने की कोशिश कीजिए"),
      severity: "minor",
      phase: "active",
      test: (f, s) => dist2(img(f, LM[`${s}Wrist`]), img(f, LM[`${s}Knee`])) < 0.25 * torso2(f),
    },
  ],
  dose: { sets: 2, reps: 10, restSeconds: 60 },
  calibration: "draft",
};

export const squat: ExerciseDefinition = {
  id: "squat",
  name: t("Squat", "स्क्वाट"),
  region: "knee",
  tags: ["strength", "knee", "hip"],
  view: "front",
  position: "standing",
  kind: "reps",
  laterality: "bilateral",
  summary: t("Bend your knees and hips as if sitting back into a chair.", "घुटने और कूल्हे मोड़िए जैसे कुर्सी पर पीछे बैठ रहे हों।"),
  setup: t("Stand facing the camera, feet shoulder-width apart.", "कैमरे की ओर मुँह करके खड़े होइए, पैर कंधे जितनी दूरी पर।"),
  steps: [
    t("Push your hips back and bend your knees.", "कूल्हे पीछे धकेलिए और घुटने मोड़िए।"),
    t("Keep your knees in line with your toes.", "घुटने पैरों की उँगलियों की सीध में रखिए।"),
    t("Stand back up.", "वापस खड़े होइए।"),
  ],
  precautions: [t("Only go as low as is pain-free.", "केवल उतना नीचे जाइए जितना बिना दर्द हो।")],
  required: reqBoth("Shoulder", "Hip", "Knee", "Ankle"),
  metric: {
    label: "Knee flexion",
    unit: "deg",
    compute: (f) => mean(joint(f, "left", "Hip", "Knee", "Ankle"), joint(f, "right", "Hip", "Knee", "Ankle")),
  },
  reps: { rest: 168, target: 100, minRepMs: 900 },
  faults: [
    {
      id: "knee-valgus",
      message: t("Knees are falling inward", "घुटने अंदर की ओर जा रहे हैं"),
      cue: t("Push your knees out over your toes", "घुटनों को पैरों की उँगलियों के ऊपर बाहर रखिए"),
      severity: "major",
      phase: "active",
      test: (f) => {
        const knees = Math.abs(img(f, LM.leftKnee).x - img(f, LM.rightKnee).x);
        const ankles = Math.abs(img(f, LM.leftAnkle).x - img(f, LM.rightAnkle).x);
        const depth = mean(joint(f, "left", "Hip", "Knee", "Ankle"), joint(f, "right", "Hip", "Knee", "Ankle")) ?? 180;
        return depth < 145 && knees < 0.8 * ankles;
      },
    },
    trunkSideLean(12),
  ],
  dose: { sets: 3, reps: 10, restSeconds: 60 },
  calibration: "draft",
};

/** Abduction angle of one leg from vertical; 0 if the leg crosses the midline. */
function legAbduction(f: PoseFrame, s: "left" | "right"): number {
  const hip = img(f, LM[`${s}Hip`]);
  const ankle = img(f, LM[`${s}Ankle`]);
  // Facing the camera, the person's left leg moves toward the image right when abducting.
  const outward = s === "left" ? ankle.x > hip.x : ankle.x < hip.x;
  return outward ? fromVertical(ankle, hip) : 0;
}

export const hipAbduction: ExerciseDefinition = {
  id: "hip-abduction",
  name: t("Standing hip abduction", "खड़े होकर पैर बगल में उठाना"),
  region: "hip",
  tags: ["hip", "glutes", "balance", "strength"],
  view: "front",
  position: "standing",
  kind: "reps",
  laterality: "alternating",
  summary: t("Lift one straight leg out to the side.", "एक सीधा पैर बगल में उठाइए।"),
  setup: t("Stand facing the camera, holding a chair for balance if needed.", "कैमरे की ओर मुँह करके खड़े होइए, ज़रूरत हो तो संतुलन के लिए कुर्सी पकड़िए।"),
  steps: [
    t("Keep your body upright and toes pointing forward.", "शरीर सीधा और पैरों की उँगलियाँ आगे रखिए।"),
    t("Lift the leg out to the side, then lower with control.", "पैर बगल में उठाइए, फिर नियंत्रण से नीचे लाइए।"),
  ],
  precautions: [t("Hold a support if your balance is unsteady.", "संतुलन अस्थिर हो तो सहारा पकड़िए।")],
  required: reqBoth("Shoulder", "Hip", "Knee", "Ankle"),
  metric: { label: "Hip abduction", unit: "deg", compute: (f, s) => legAbduction(f, s) },
  reps: { rest: 4, target: 28, minRepMs: 700 },
  faults: [trunkSideLean(10), kneeBent(155)],
  dose: { sets: 2, reps: 10, restSeconds: 45 },
  reference: { value: 45, note: "Typical adult hip abduction 40-45 degrees" },
  calibration: "draft",
};

export const marching: ExerciseDefinition = {
  id: "marching",
  name: t("Standing march (hip flexion)", "खड़े होकर कदमताल"),
  region: "hip",
  tags: ["hip", "balance", "elderly", "warm-up"],
  view: "front",
  position: "standing",
  kind: "reps",
  laterality: "alternating",
  summary: t("March on the spot, lifting each knee toward hip height.", "एक ही जगह कदमताल कीजिए, हर घुटना कूल्हे की ऊँचाई तक उठाइए।"),
  setup: t("Stand facing the camera, near a support.", "कैमरे की ओर मुँह करके सहारे के पास खड़े होइए।"),
  steps: [
    t("Lift one knee up, then lower it.", "एक घुटना ऊपर उठाइए, फिर नीचे लाइए।"),
    t("Alternate legs at a steady pace.", "बारी-बारी से पैर बदलते रहिए।"),
  ],
  precautions: [t("Keep a chair nearby for balance.", "संतुलन के लिए पास में कुर्सी रखिए।")],
  required: reqBoth("Shoulder", "Hip", "Knee", "Ankle"),
  metric: {
    label: "Hip flexion",
    unit: "deg",
    compute: (f, s) => {
      const a = joint(f, s, "Shoulder", "Hip", "Knee");
      return a === null ? null : 180 - a;
    },
  },
  reps: { rest: 12, target: 75, minRepMs: 400 },
  faults: [trunkSideLean(10)],
  dose: { sets: 2, reps: 20, restSeconds: 30 },
  calibration: "draft",
};

export const hipExtension: ExerciseDefinition = {
  id: "hip-extension",
  name: t("Standing hip extension", "खड़े होकर पैर पीछे ले जाना"),
  region: "hip",
  tags: ["hip", "glutes", "back-pain"],
  view: "side",
  position: "standing",
  kind: "reps",
  laterality: "unilateral",
  summary: t("Holding a chair, move one straight leg backwards.", "कुर्सी पकड़कर एक सीधा पैर पीछे ले जाइए।"),
  setup: t("Stand side-on to the camera, holding a chair, working leg nearest the camera.", "कैमरे की ओर बगल से कुर्सी पकड़कर खड़े होइए, काम करने वाला पैर कैमरे के पास।"),
  steps: [
    t("Keep your chest up and back still.", "छाती ऊपर और पीठ स्थिर रखिए।"),
    t("Move the straight leg backwards, squeezing your buttock.", "सीधे पैर को पीछे ले जाइए, नितंब कसिए।"),
    t("Return slowly.", "धीरे से वापस लाइए।"),
  ],
  precautions: [t("Don't arch your lower back to get more range.", "ज़्यादा रेंज के लिए कमर मत मोड़िए।")],
  required: req("Shoulder", "Hip", "Knee", "Ankle"),
  metric: {
    label: "Hip extension",
    unit: "deg",
    // Positive when the knee is behind the hip.
    compute: (f, s) => segmentForward(f, LM[`${s}Knee`], LM[`${s}Hip`]),
  },
  reps: { rest: 2, target: 18, minRepMs: 700 },
  faults: [leaningForward(15), kneeBent(150)],
  dose: { sets: 2, reps: 10, restSeconds: 45 },
  reference: { value: 20, note: "Typical adult hip extension 10-30 degrees" },
  calibration: "draft",
};

/** Is this side's foot the leading foot (ahead in the facing direction)? */
function isLeadLeg(f: PoseFrame, s: "left" | "right"): boolean {
  const dir = facing(f);
  const a = img(f, LM[`${s}Ankle`]).x * dir;
  const b = img(f, LM[`${otherSide(s)}Ankle`]).x * dir;
  return a > b;
}

export const forwardLunge: ExerciseDefinition = {
  id: "forward-lunge",
  name: t("Forward lunge", "आगे लंज"),
  region: "knee",
  tags: ["strength", "knee", "hip", "balance"],
  view: "side",
  position: "standing",
  kind: "reps",
  laterality: "alternating",
  summary: t("Step forward and lower your back knee toward the floor.", "आगे कदम रखिए और पिछला घुटना ज़मीन की ओर नीचे लाइए।"),
  setup: t("Stand side-on to the camera with space in front of you.", "कैमरे की ओर बगल से खड़े होइए, आगे जगह हो।"),
  steps: [
    t("Step forward with one leg.", "एक पैर आगे बढ़ाइए।"),
    t("Bend both knees, keeping your chest up.", "दोनों घुटने मोड़िए, छाती ऊपर रखिए।"),
    t("Push back to standing and switch legs.", "वापस खड़े होइए और पैर बदलिए।"),
  ],
  precautions: [t("Use a support if balance is a concern.", "संतुलन की चिंता हो तो सहारा लीजिए।")],
  required: reqBoth("Hip", "Knee", "Ankle", "FootIndex"),
  metric: {
    label: "Front knee flexion",
    unit: "deg",
    compute: (f, s) => (isLeadLeg(f, s) ? joint(f, s, "Hip", "Knee", "Ankle") : 175),
  },
  reps: { rest: 165, target: 100, minRepMs: 900 },
  faults: [
    {
      id: "knee-past-toes",
      message: t("Front knee is far past the toes", "आगे का घुटना उँगलियों से बहुत आगे है"),
      cue: t("Keep your front knee above your ankle", "आगे का घुटना टखने के ऊपर रखिए"),
      severity: "minor",
      phase: "active",
      test: (f, s) =>
        isLeadLeg(f, s) &&
        (img(f, LM[`${s}Knee`]).x - img(f, LM[`${s}FootIndex`]).x) * facing(f) > 0.12 * torso2(f),
    },
    leaningForward(25),
  ],
  dose: { sets: 2, reps: 8, restSeconds: 60 },
  calibration: "draft",
};

function heelLiftCm(f: PoseFrame): number | null {
  const l = img(f, LM.leftFootIndex).y - img(f, LM.leftHeel).y;
  const r = img(f, LM.rightFootIndex).y - img(f, LM.rightHeel).y;
  const v = imgToCm(f, (l + r) / 2);
  return Number.isFinite(v) ? v : null;
}

export const calfRaise: ExerciseDefinition = {
  id: "calf-raise",
  name: t("Calf raise", "एड़ी उठाना"),
  region: "ankle",
  tags: ["ankle", "balance", "elderly", "strength"],
  view: "side",
  position: "standing",
  kind: "reps",
  laterality: "bilateral",
  summary: t("Rise up onto your toes and lower slowly.", "पंजों पर ऊपर उठिए और धीरे से नीचे आइए।"),
  setup: t("Stand side-on to the camera, holding a support lightly.", "कैमरे की ओर बगल से खड़े होइए, हल्का सहारा पकड़िए।"),
  steps: [
    t("Stand still for a moment.", "एक पल स्थिर खड़े रहिए।"),
    t("Rise up onto the balls of your feet, hold for a second.", "पंजों पर ऊपर उठिए, एक सेकंड रुकिए।"),
    t("Lower slowly.", "धीरे से नीचे आइए।"),
  ],
  precautions: [t("Keep a support nearby.", "पास में सहारा रखिए।")],
  required: reqBoth("Knee", "Ankle", "Heel", "FootIndex"),
  metric: {
    label: "Heel lift",
    unit: "cm",
    baselineOf: (f) => heelLiftCm(f),
    compute: (f, _s, { baseline }) => {
      const v = heelLiftCm(f);
      return v === null ? null : v - (baseline ?? 0);
    },
  },
  reps: { rest: 0, target: 5, holdMs: 500, minRepMs: 700 },
  faults: [kneeBent(160)],
  dose: { sets: 2, reps: 15, restSeconds: 45 },
  calibration: "draft",
};

export const seatedKneeExtension: ExerciseDefinition = {
  id: "seated-knee-extension",
  name: t("Seated knee extension", "बैठकर घुटना सीधा करना"),
  region: "knee",
  tags: ["knee", "osteoarthritis", "elderly", "strength"],
  view: "side",
  position: "seated",
  kind: "reps",
  laterality: "unilateral",
  summary: t("Sitting on a chair, straighten one knee and hold.", "कुर्सी पर बैठकर एक घुटना सीधा करके रोकिए।"),
  setup: t("Sit side-on to the camera, working leg nearest the camera.", "कैमरे की ओर बगल से बैठिए, काम करने वाला पैर कैमरे के पास।"),
  steps: [
    t("Sit tall with your back against the chair.", "कुर्सी से पीठ टिकाकर सीधे बैठिए।"),
    t("Straighten your knee fully and hold for 2 seconds.", "घुटना पूरा सीधा करके 2 सेकंड रोकिए।"),
    t("Lower slowly.", "धीरे से नीचे लाइए।"),
  ],
  precautions: [t("Move within a comfortable range.", "आरामदायक सीमा में चलिए।")],
  required: req("Shoulder", "Hip", "Knee", "Ankle"),
  metric: { label: "Knee extension", unit: "deg", compute: (f, s) => joint(f, s, "Hip", "Knee", "Ankle") },
  reps: { rest: 100, target: 165, holdMs: 1500, minRepMs: 1000 },
  faults: [leaningBack(15)],
  dose: { sets: 2, reps: 10, restSeconds: 45 },
  reference: { value: 180, note: "Full knee extension = 180 degrees" },
  calibration: "draft",
};

export const hamstringCurl: ExerciseDefinition = {
  id: "hamstring-curl",
  name: t("Standing hamstring curl", "खड़े होकर घुटना पीछे मोड़ना"),
  region: "knee",
  tags: ["knee", "hamstring", "strength"],
  view: "side",
  position: "standing",
  kind: "reps",
  laterality: "unilateral",
  summary: t("Holding a chair, bend one knee to bring your heel toward your buttock.", "कुर्सी पकड़कर एक घुटना मोड़िए और एड़ी को नितंब की ओर लाइए।"),
  setup: t("Stand side-on to the camera holding a chair, working leg nearest the camera.", "कैमरे की ओर बगल से कुर्सी पकड़कर खड़े होइए, काम करने वाला पैर कैमरे के पास।"),
  steps: [
    t("Keep your thighs together.", "जाँघें साथ रखिए।"),
    t("Bend the knee as far as is comfortable.", "घुटना जितना आराम से हो मोड़िए।"),
    t("Lower slowly.", "धीरे से नीचे लाइए।"),
  ],
  precautions: [t("Keep a support for balance.", "संतुलन के लिए सहारा रखिए।")],
  required: req("Shoulder", "Hip", "Knee", "Ankle"),
  metric: { label: "Knee flexion", unit: "deg", compute: (f, s) => joint(f, s, "Hip", "Knee", "Ankle") },
  reps: { rest: 168, target: 90, minRepMs: 800 },
  faults: [
    {
      id: "thigh-swinging",
      message: t("Thigh is moving forward", "जाँघ आगे जा रही है"),
      cue: t("Keep your thigh pointing down", "जाँघ नीचे की ओर सीधी रखिए"),
      severity: "minor",
      phase: "active",
      test: (f, s) => segmentForward(f, LM[`${s}Knee`], LM[`${s}Hip`]) < -15,
    },
  ],
  dose: { sets: 2, reps: 10, restSeconds: 45 },
  calibration: "draft",
};

export const singleLegStance: ExerciseDefinition = {
  id: "single-leg-stance",
  name: t("Single-leg balance", "एक पैर पर संतुलन"),
  region: "balance",
  tags: ["balance", "elderly", "falls-prevention", "assessment"],
  view: "front",
  position: "standing",
  kind: "timed-balance",
  laterality: "unilateral",
  summary: t("Stand on one leg for as long as you safely can.", "जितनी देर सुरक्षित रूप से हो सके एक पैर पर खड़े रहिए।"),
  setup: t("Stand facing the camera next to a wall or sturdy chair.", "दीवार या मज़बूत कुर्सी के पास कैमरे की ओर मुँह करके खड़े होइए।"),
  steps: [
    t("Lift one foot a few centimetres off the floor.", "एक पैर ज़मीन से कुछ सेंटीमीटर ऊपर उठाइए।"),
    t("Hold steady, eyes looking ahead.", "सामने देखते हुए स्थिर रहिए।"),
  ],
  precautions: [t("Always have a support within reach. Do not do this if you have had recent falls without clinician approval.", "हमेशा सहारा पहुँच में रखिए। हाल में गिरे हों तो डॉक्टर की अनुमति के बिना यह मत कीजिए।")],
  required: reqBoth("Shoulder", "Hip", "Knee", "Ankle"),
  metric: {
    // side = the lifted foot.
    label: "Foot lift",
    unit: "cm",
    compute: (f, s) => imgToCm(f, img(f, LM[`${otherSide(s)}Ankle`]).y - img(f, LM[`${s}Ankle`]).y),
  },
  hold: { threshold: 4, comparator: "gte", targetSeconds: 30 },
  secondary: [
    {
      id: "sway",
      label: "Body sway",
      unit: "cm",
      keep: "std",
      compute: (f) => imgToCm(f, mid2(img(f, LM.leftHip), img(f, LM.rightHip)).x),
    },
  ],
  faults: [trunkSideLean(12)],
  dose: { sets: 2, holdSeconds: 30, restSeconds: 30 },
  reference: { value: 30, note: "Healthy adults under 60 typically hold 30 s or more" },
  calibration: "draft",
};

/** Hip offset from the shoulder-ankle line in cm; positive = hips sagging below the line. */
function hipSagCm(f: PoseFrame, s: "left" | "right"): number {
  const sh = img(f, LM[`${s}Shoulder`]);
  const an = img(f, LM[`${s}Ankle`]);
  const hp = img(f, LM[`${s}Hip`]);
  const dx = an.x - sh.x;
  if (Math.abs(dx) < 1e-6) return 0;
  const lineY = sh.y + ((hp.x - sh.x) / dx) * (an.y - sh.y);
  return imgToCm(f, hp.y - lineY);
}

export const plank: ExerciseDefinition = {
  id: "plank",
  name: t("Forearm plank", "प्लैंक"),
  region: "core",
  tags: ["core", "back-pain", "stability"],
  view: "side",
  position: "prone",
  kind: "hold",
  laterality: "bilateral",
  summary: t("Hold your body in a straight line on forearms and toes (or knees).", "कोहनियों और पंजों (या घुटनों) पर शरीर को सीधी रेखा में रोकिए।"),
  setup: t("Side-on to the camera, forearms on the floor under your shoulders.", "कैमरे की ओर बगल से, कोहनियाँ कंधों के नीचे ज़मीन पर।"),
  steps: [
    t("Lift your body so shoulders, hips and ankles are in a line.", "शरीर उठाइए ताकि कंधे, कूल्हे और टखने एक रेखा में हों।"),
    t("Breathe normally and hold.", "सामान्य साँस लेते हुए रुकिए।"),
  ],
  precautions: [t("Drop to your knees if your back hurts.", "कमर में दर्द हो तो घुटनों पर आ जाइए।")],
  required: req("Shoulder", "Elbow", "Hip", "Knee", "Ankle"),
  metric: {
    label: "Body line",
    unit: "deg",
    compute: (f, s) => {
      // Not in a plank if the body is upright.
      if (fromVertical(img(f, LM[`${s}Ankle`]), img(f, LM[`${s}Shoulder`])) < 50) return 0;
      return joint(f, s, "Shoulder", "Hip", "Ankle");
    },
  },
  hold: { threshold: 160, comparator: "gte", targetSeconds: 30 },
  faults: [
    {
      id: "hips-sagging",
      message: t("Hips are sagging", "कूल्हे नीचे झुक रहे हैं"),
      cue: t("Lift your hips a little", "कूल्हे थोड़ा ऊपर उठाइए"),
      severity: "major",
      phase: "active",
      test: (f, s) => hipSagCm(f, s) > 6,
    },
    {
      id: "hips-piking",
      message: t("Hips are too high", "कूल्हे बहुत ऊपर हैं"),
      cue: t("Lower your hips into a straight line", "कूल्हे नीचे लाकर सीधी रेखा बनाइए"),
      severity: "minor",
      phase: "active",
      test: (f, s) => hipSagCm(f, s) < -9,
    },
  ],
  dose: { sets: 3, holdSeconds: 30, restSeconds: 45 },
  calibration: "draft",
};

export const lowerExercises = [
  sitToStand,
  squat,
  hipAbduction,
  marching,
  hipExtension,
  forwardLunge,
  calfRaise,
  seatedKneeExtension,
  hamstringCurl,
  singleLegStance,
  plank,
];
