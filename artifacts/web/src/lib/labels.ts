import { REGION_LABELS } from "@kynex/motion";
import type { Lang } from "./voice.ts";

type Labels = Record<string, { en: string; hi: string }>;

export const POSITION_LABELS: Labels = {
  standing: { en: "Standing", hi: "खड़े होकर" },
  seated: { en: "Sitting", hi: "बैठकर" },
  supine: { en: "Lying on back", hi: "पीठ के बल लेटकर" },
  prone: { en: "Lying on front", hi: "पेट के बल लेटकर" },
  quadruped: { en: "On hands and knees", hi: "हाथों और घुटनों पर" },
};

export const VIEW_LABELS: Labels = {
  front: { en: "Face the camera", hi: "कैमरे की ओर मुँह" },
  side: { en: "Side-on to camera", hi: "कैमरे की ओर बगल से" },
};

export const CALIBRATION_LABELS: Labels = {
  draft: { en: "Camera counting: draft", hi: "कैमरा गिनती: प्रारंभिक" },
  "lab-tested": { en: "Camera counting: lab-tested", hi: "कैमरा गिनती: लैब में जाँची" },
  "clinician-reviewed": { en: "Camera counting: clinician-reviewed", hi: "कैमरा गिनती: क्लिनिशियन द्वारा जाँची" },
};

export const regionLabel = (region: string, lang: Lang) => REGION_LABELS[region as keyof typeof REGION_LABELS]?.[lang] ?? region;
export const label = (labels: Labels, key: string, lang: Lang) => labels[key]?.[lang] ?? key;

/** Screen words that change with the language switch. */
export const UI = {
  library: { en: "Exercise library", hi: "व्यायाम सूची" },
  search: { en: "Search exercises", hi: "व्यायाम खोजें" },
  all: { en: "All", hi: "सभी" },
  hidden: { en: "Hidden", hi: "छिपा हुआ" },
  none: { en: "No exercise matches. Clear the search or filters.", hi: "कोई व्यायाम नहीं मिला। खोज या फ़िल्टर हटाइए।" },
  tryIt: { en: "Try it with camera", hi: "कैमरे के साथ आज़माइए" },
  setup: { en: "Starting position", hi: "शुरुआती स्थिति" },
  steps: { en: "Steps", hi: "चरण" },
  precautions: { en: "Take care", hi: "सावधानियाँ" },
  dose: { en: "Usual dose", hi: "सामान्य मात्रा" },
  camera: { en: "What the camera does", hi: "कैमरा क्या करता है" },
  video: { en: "Instructor video", hi: "प्रशिक्षक वीडियो" },
  videoComing: { en: "Video coming", hi: "वीडियो जल्द आएगा" },
} satisfies Labels;

export const t = (key: keyof typeof UI, lang: Lang) => UI[key][lang];

export function doseText(dose: { sets: number; reps?: number; holdSeconds?: number; restSeconds: number }, lang: Lang) {
  const amount = dose.reps
    ? lang === "en"
      ? `${dose.sets} sets × ${dose.reps} reps`
      : `${dose.sets} सेट × ${dose.reps} बार`
    : lang === "en"
      ? `${dose.sets} × ${dose.holdSeconds ?? 0} s hold`
      : `${dose.sets} × ${dose.holdSeconds ?? 0} सेकंड रोकें`;
  return lang === "en" ? `${amount}, ${dose.restSeconds} s rest between sets` : `${amount}, सेटों के बीच ${dose.restSeconds} सेकंड आराम`;
}
