/**
 * Plain-language explanation of what the camera measures and checks for an exercise.
 * Generated from the exercise definition (and any calibration overrides) so the text
 * always matches what the tracker actually does.
 */
import { LM } from "./landmarks.ts";
import type { ExerciseDefinition, HoldRule, LocalisedText, RepRule } from "./types.ts";

type Lang = "en" | "hi";
const t = (en: string, hi: string): LocalisedText => ({ en, hi });

/** What the main number means, in words a patient or tester understands. */
const MEASURE_NOTES: Record<string, LocalisedText> = {
  "neck-rotation": t("How far your head turns from looking straight ahead (0° = straight ahead).", "सीधे सामने देखने से सिर कितना घूमता है (0° = सीधा)।"),
  "neck-side-bend": t("How far your head tilts toward the shoulder, compared with your shoulder line (0° = upright).", "कंधों की रेखा के मुकाबले सिर कितना झुकता है (0° = सीधा)।"),
  "chin-tuck": t("How far your ear moves back over your shoulder, in centimetres.", "कान कंधे के ऊपर कितना पीछे जाता है, सेंटीमीटर में।"),
  "shoulder-flexion": t("Angle between your arm and your body (0° = arm by your side, 180° = straight up).", "बाँह और शरीर के बीच का कोण (0° = बगल में, 180° = सीधा ऊपर)।"),
  "shoulder-abduction": t("Angle between your arm and your body when raised sideways (0° = by your side, 180° = straight up).", "बगल से उठाने पर बाँह और शरीर का कोण (0° = बगल में, 180° = सीधा ऊपर)।"),
  "elbow-flexion": t("The angle at your elbow (180° = arm straight; smaller = more bent).", "कोहनी का कोण (180° = सीधी बाँह; कम = ज़्यादा मुड़ी)।"),
  "shoulder-shrug": t("How many centimetres your shoulders lift toward your ears.", "कंधे कानों की ओर कितने सेंटीमीटर उठते हैं।"),
  "forward-bend": t("How far your trunk bends forward at the hips (0° = upright). Also: fingertip-to-floor distance.", "कूल्हों से धड़ कितना आगे झुकता है (0° = सीधा)। साथ में: उंगलियों से ज़मीन की दूरी।"),
  "side-bend": t("How far your trunk leans sideways from upright (0° = upright).", "धड़ सीधे से कितना बगल में झुकता है (0° = सीधा)।"),
  "trunk-rotation": t("How far your shoulders turn compared with your hips (0° = facing forward).", "कूल्हों के मुकाबले कंधे कितने घूमते हैं (0° = सामने)।"),
  "back-extension": t("How far your trunk leans back from upright (0° = upright).", "धड़ सीधे से कितना पीछे झुकता है (0° = सीधा)।"),
  "bird-dog": t("How straight the lifted arm and leg are in line with your body (180° = fully in line).", "उठी हुई बाँह और पैर शरीर की सीध में कितने हैं (180° = पूरी सीध)।"),
  "glute-bridge": t("The angle at your hip between shoulder, hip and knee (180° = body in a straight line).", "कंधे, कूल्हे और घुटने के बीच कूल्हे का कोण (180° = सीधी रेखा)।"),
  "straight-leg-raise": t("How high the straight leg lifts from the floor (0° = flat).", "सीधा पैर ज़मीन से कितना ऊपर उठता है (0° = ज़मीन पर)।"),
  "sit-to-stand": t("The angle at your knee (about 90-100° sitting, 170-180° standing).", "घुटने का कोण (बैठे हुए लगभग 90-100°, खड़े होकर 170-180°)।"),
  squat: t("The angle at your knee (about 170-180° standing; smaller = deeper squat).", "घुटने का कोण (खड़े होकर लगभग 170-180°; कम = ज़्यादा गहरा)।"),
  "hip-abduction": t("How far your leg moves out to the side from vertical (0° = straight down).", "पैर सीधे नीचे से कितना बगल में जाता है (0° = सीधा)।"),
  marching: t("How high your thigh lifts from hanging straight down (90° = thigh level).", "जांघ सीधे नीचे से कितनी ऊपर उठती है (90° = ज़मीन के समानांतर)।"),
  "hip-extension": t("How far your straight leg moves behind your body (0° = straight down).", "सीधा पैर शरीर के पीछे कितना जाता है (0° = सीधा नीचे)।"),
  "forward-lunge": t("The angle at your front knee (about 170° standing, about 90° at the bottom).", "आगे वाले घुटने का कोण (खड़े होकर लगभग 170°, नीचे लगभग 90°)।"),
  "calf-raise": t("How many centimetres your heels lift off the floor.", "एड़ियाँ ज़मीन से कितने सेंटीमीटर उठती हैं।"),
  "seated-knee-extension": t("The angle at your knee (about 90-100° when sitting, 180° fully straight).", "घुटने का कोण (बैठे हुए लगभग 90-100°, पूरा सीधा 180°)।"),
  "hamstring-curl": t("The angle at your knee (about 170-180° straight; smaller = heel closer to buttock).", "घुटने का कोण (सीधा लगभग 170-180°; कम = एड़ी नितंब के पास)।"),
  "single-leg-stance": t("Whether one foot is off the floor, and how much your body sways while you balance.", "एक पैर ज़मीन से उठा है या नहीं, और संतुलन के दौरान शरीर कितना हिलता है।"),
  plank: t("How straight your body is from shoulder through hip to ankle (180° = perfectly straight).", "कंधे से कूल्हे होते हुए टखने तक शरीर कितना सीधा है (180° = पूरी तरह सीधा)।"),
};

const PARTS: [number[], LocalisedText][] = [
  [[LM.nose, LM.leftEar, LM.rightEar], t("head", "सिर")],
  [[LM.leftShoulder, LM.rightShoulder], t("shoulders", "कंधे")],
  [[LM.leftElbow, LM.rightElbow], t("elbows", "कोहनियाँ")],
  [[LM.leftWrist, LM.rightWrist, LM.leftIndex, LM.rightIndex], t("hands", "हाथ")],
  [[LM.leftHip, LM.rightHip], t("hips", "कूल्हे")],
  [[LM.leftKnee, LM.rightKnee], t("knees", "घुटने")],
  [[LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel, LM.leftFootIndex, LM.rightFootIndex], t("feet", "पैर (पंजे)")],
];

/** Body-part names for a list of landmark ids, e.g. [25, 27] -> "knees, feet". */
export function bodyPartNames(ids: number[], lang: Lang): string {
  const set = new Set(ids);
  return PARTS.filter(([p]) => p.some((i) => set.has(i)))
    .map(([, name]) => name[lang])
    .join(", ");
}

export interface ExerciseExplanation {
  camera: string;
  inView: string;
  measures: string;
  measureNote: string;
  baseline: string | null;
  counting: string;
  checks: { text: string; severity: "minor" | "major" }[];
  scoring: string;
}

export function explainExercise(
  def: ExerciseDefinition,
  lang: Lang,
  rules: { reps?: RepRule | null; hold?: HoldRule | null } = {},
): ExerciseExplanation {
  const L = (x: LocalisedText) => x[lang];
  const u = def.metric.unit === "deg" ? "°" : ` ${def.metric.unit}`;
  const n = (v: number) => `${def.metric.unit === "deg" ? Math.round(v) : Math.round(v * 10) / 10}${u}`;

  const camera =
    def.view === "front"
      ? L(t("Face the camera, about 2-3 metres away. Prop the phone up at waist height (don't hold it).", "कैमरे की ओर मुँह करें, लगभग 2-3 मीटर दूर। फ़ोन को कमर की ऊँचाई पर टिकाकर रखें (हाथ में न पकड़ें)।"))
      : L(t("Turn side-on to the camera, about 2-3 metres away. Prop the phone up at waist height (don't hold it).", "कैमरे की ओर बगल से खड़े हों, लगभग 2-3 मीटर दूर। फ़ोन को कमर की ऊँचाई पर टिकाकर रखें (हाथ में न पकड़ें)।"));

  const required = new Set(def.required("left").concat(def.required("right")));
  const parts = PARTS.filter(([ids]) => ids.some((i) => required.has(i))).map(([, name]) => L(name));
  const inView = `${L(t("The camera must see your", "कैमरे को दिखना चाहिए:"))} ${parts.join(", ")}.`;

  const measures = `${def.metric.label} (${def.metric.unit === "deg" ? L(t("degrees", "डिग्री")) : def.metric.unit === "cm" ? L(t("centimetres", "सेंटीमीटर")) : L(t("seconds", "सेकंड"))})`;
  const measureNote = L(MEASURE_NOTES[def.id] ?? t("", ""));

  const baseline = def.metric.baselineOf
    ? L(t("First hold still for about 2 seconds so it learns your neutral position. Movement is measured from there.", "पहले लगभग 2 सेकंड स्थिर रहें ताकि यह आपकी सामान्य स्थिति सीख ले। गति वहीं से मापी जाती है।"))
    : null;

  const reps = rules.reps ?? def.reps;
  const hold = rules.hold ?? def.hold;
  let counting = "";
  if (reps) {
    const full = reps.full ?? 0.85;
    const partial = reps.partial ?? 0.5;
    const at = (p: number) => n(reps.rest + (reps.target - reps.rest) * p);
    const perSide = def.laterality === "alternating" ? L(t(" Each side is counted separately.", " हर तरफ़ अलग से गिना जाता है।")) : "";
    const holdTxt = reps.holdMs ? L(t(` Hold the end position for ${(reps.holdMs / 1000).toFixed(1)} s.`, ` अंतिम स्थिति ${(reps.holdMs / 1000).toFixed(1)} सेकंड रोकें।`)) : "";
    counting =
      lang === "en"
        ? `One rep = move from about ${n(reps.rest)} to ${n(reps.target)} and back. Reaching ${at(full)} or more counts as a full rep; ${at(partial)} or more counts as a partial rep (the app tells you to go further).${holdTxt}${perSide}`
        : `एक रेप = लगभग ${n(reps.rest)} से ${n(reps.target)} तक जाना और वापस आना। ${at(full)} या उससे ज़्यादा = पूरा रेप; ${at(partial)} या उससे ज़्यादा = आधा रेप (ऐप आगे जाने को कहेगा)।${holdTxt}${perSide}`;
  } else if (hold) {
    const cmp = hold.comparator === "gte" ? (lang === "en" ? "at least" : "कम से कम") : lang === "en" ? "at most" : "ज़्यादा से ज़्यादा";
    counting =
      lang === "en"
        ? `The timer runs only while ${def.metric.label.toLowerCase()} is ${cmp} ${n(hold.threshold)}. Target: ${hold.targetSeconds} s.`
        : `टाइमर तभी चलता है जब ${def.metric.label} ${cmp} ${n(hold.threshold)} हो। लक्ष्य: ${hold.targetSeconds} सेकंड।`;
  }

  const checks = def.faults.map((f) => ({ text: L(f.message), severity: f.severity }));
  const scoring = L(
    t(
      "Each rep or hold gets a form score out of 100: a major form problem takes off 25, a minor one 10, and a partial rep scores 75 at most.",
      "हर रेप या होल्ड को 100 में से फ़ॉर्म स्कोर मिलता है: बड़ी गलती पर 25, छोटी पर 10 कम, और आधे रेप पर अधिकतम 75।",
    ),
  );

  return { camera, inView, measures, measureNote, baseline, counting, checks, scoring };
}
