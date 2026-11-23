import type { ExerciseDefinition } from "@kynex/motion";

type Lang = "en" | "hi";

/**
 * The 1–3 things that decide whether a rep or hold counts. Shown highlighted on the
 * exercise screen and as a "Remember" banner on the camera screen, because people
 * don't read long instructions (23 Nov 2026 phone test).
 */
export function keyPoints(def: ExerciseDefinition, lang: Lang, holdSeconds?: number): string[] {
  const out: string[] = [];
  const floor = def.position === "supine" || def.position === "prone" || def.position === "quadruped";
  out.push(
    floor
      ? lang === "en"
        ? "Lie fully inside the box on the screen, head to feet. Counting starts when the box turns green."
        : "स्क्रीन पर बने बॉक्स के अंदर पूरे लेटिए, सिर से पैर तक। बॉक्स हरा होने पर गिनती शुरू होगी।"
      : def.position === "seated"
        ? lang === "en"
          ? "Sit inside the box on the screen, head to knees. Counting starts when the box turns green."
          : "स्क्रीन पर बने बॉक्स के अंदर बैठिए, सिर से घुटनों तक। बॉक्स हरा होने पर गिनती शुरू होगी।"
        : lang === "en"
          ? "Stand fully inside the box on the screen, head to feet. Counting starts when the box turns green."
          : "स्क्रीन पर बने बॉक्स के अंदर पूरे खड़े होइए, सिर से पैर तक। बॉक्स हरा होने पर गिनती शुरू होगी।",
  );
  if (def.kind === "reps") {
    const hold = def.reps?.holdMs ?? 0;
    if (hold > 0) {
      const s = Math.round(hold / 100) / 10;
      out.push(
        lang === "en"
          ? `Hold the end position for ${s} seconds every rep, or it won't count.`
          : `हर रेप में आख़िरी स्थिति ${s} सेकंड रोकिए, वरना वह नहीं गिना जाएगा।`,
      );
    }
    out.push(lang === "en" ? "Only complete reps count. If one isn't complete, you'll hear why: do it again." : "सिर्फ़ पूरे रेप गिने जाते हैं। अधूरा हो तो वजह सुनाई देगी: उसे फिर से कीजिए।");
  } else {
    const s = holdSeconds ?? def.hold?.targetSeconds ?? 20;
    const foot = def.id === "single-leg-stance";
    out.push(
      lang === "en"
        ? `Hold for ${s} seconds. If ${foot ? "your foot touches down" : "you drop out of position"}, the timer starts again from ${s}.`
        : `${s} सेकंड रोकिए। ${foot ? "पैर नीचे लगा" : "स्थिति टूटी"} तो टाइमर फिर ${s} से शुरू होगा।`,
    );
  }
  return out;
}
