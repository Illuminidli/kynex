import {
  getGetExerciseQueryKey,
  getListExercisesQueryKey,
  useGetExercise,
  useSetExerciseVisibility,
  type ExerciseDetail,
  type Me,
} from "@kynex/api-client-react";
import { ExerciseDemo } from "../components/demo/ExerciseDemo.tsx";
import { explainExercise, getExercise } from "@kynex/motion";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { LangSwitch } from "../components/LangSwitch.tsx";
import { Card, Shell } from "../components/Shell.tsx";
import { useLang } from "../lib/lang.ts";
import { CALIBRATION_LABELS, doseText, label, POSITION_LABELS, regionLabel, t, VIEW_LABELS } from "../lib/labels.ts";
import { Tag } from "./LibraryPage.tsx";

export function ExercisePage({ me, slug }: { me: Me; slug: string }) {
  const [lang] = useLang();
  const query = useGetExercise(slug, { query: { queryKey: getGetExerciseQueryKey(slug) } });
  const back = { href: "/library", label: t("library", lang) };

  if (query.isPending) {
    return (
      <Shell me={me} title="…" back={back}>
        <p className="text-ink-soft">Loading…</p>
      </Shell>
    );
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <Shell me={me} title="Exercise not found" back={back}>
        <Card>
          <p className="text-ink-soft">
            {query.data && query.data.status !== 200 ? query.data.data.error : "Couldn't load this exercise. Check your connection and reload."}
          </p>
        </Card>
      </Shell>
    );
  }

  const e = query.data.data;
  return (
    <Shell me={me} title={e.name[lang]} back={back} aside={<LangSwitch />}>
      <p className="-mt-2 text-ink-soft">{e.summary[lang]}</p>
      <div className="-mt-2 flex flex-wrap gap-1.5 text-xs">
        <Tag>{regionLabel(e.region, lang)}</Tag>
        <Tag>{label(POSITION_LABELS, e.position, lang)}</Tag>
        <Tag>{label(VIEW_LABELS, e.view, lang)}</Tag>
        <span className="rounded-md bg-accent-50 px-2 py-0.5 font-medium text-accent-600">{label(CALIBRATION_LABELS, e.calibration, lang)}</span>
        {e.hidden && <span className="rounded-md bg-bad-soft px-2 py-0.5 font-semibold text-bad">{t("hidden", lang)}</span>}
      </div>

      <Link
        href={`/library/${e.slug}/try`}
        className="flex items-center justify-center gap-2 rounded-2xl bg-brand-700 px-5 py-4 text-lg font-semibold text-white shadow-soft hover:bg-brand-800"
      >
        <span aria-hidden>●</span> {t("tryIt", lang)}
      </Link>

      <ExerciseDemo exerciseId={e.slug} lang={lang} />
      <VideoSlot status={e.videoStatus} lang={lang} />

      <Card title={t("setup", lang)}>
        <p>{e.setup[lang]}</p>
      </Card>
      <Card title={t("steps", lang)}>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          {e.steps.map((s, i) => (
            <li key={i}>{s[lang]}</li>
          ))}
        </ol>
      </Card>
      {e.precautions.length > 0 && (
        <Card title={t("precautions", lang)}>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {e.precautions.map((p, i) => (
              <li key={i}>{p[lang]}</li>
            ))}
          </ul>
        </Card>
      )}
      <Card title={t("dose", lang)}>
        <p>{doseText(e.dose, lang)}</p>
        <p className="mt-1 text-sm text-ink-soft">
          {lang === "en" ? "The clinician can change this for each patient (next module)." : "क्लिनिशियन हर मरीज़ के लिए इसे बदल सकते हैं (अगला मॉड्यूल)।"}
        </p>
      </Card>
      <CameraCard exercise={e} lang={lang} />
      {me.role === "admin" && <HideControl exercise={e} clinic={me.clinic.name} />}
    </Shell>
  );
}

function VideoSlot({ status, lang }: { status: ExerciseDetail["videoStatus"]; lang: "en" | "hi" }) {
  const statusText = {
    none: { en: "No video yet", hi: "अभी कोई वीडियो नहीं" },
    draft: { en: "Video waiting for clinician approval", hi: "वीडियो क्लिनिशियन की मंज़ूरी के इंतज़ार में" },
    approved: { en: "Approved", hi: "मंज़ूर" },
  }[status][lang];
  return (
    <p className="rounded-2xl border border-dashed border-brand-200 bg-brand-50 px-4 py-3 text-sm">
      <b className="text-brand-800">{t("video", lang)}:</b> {t("videoComing", lang)} · <span className="text-ink-soft">{statusText}</span>
      <span className="block text-ink-soft">{lang === "en" ? "Until then, patients see the animated demo above." : "तब तक मरीज़ ऊपर का एनिमेटेड डेमो देखते हैं।"}</span>
    </p>
  );
}

/** What the camera measures and checks, generated from the same rules the counting uses. */
function CameraCard({ exercise, lang }: { exercise: ExerciseDetail; lang: "en" | "hi" }) {
  const def = getExercise(exercise.slug);
  if (!def) return null;
  const x = explainExercise(def, lang);
  const rows: [string, string][] = [
    [lang === "en" ? "Phone placement" : "फ़ोन कहाँ रखें", x.camera],
    [lang === "en" ? "Must be in view" : "दिखना ज़रूरी", x.inView],
    [lang === "en" ? "Measures" : "मापता है", `${x.measures}. ${x.measureNote}`],
    ...(x.baseline ? ([[lang === "en" ? "First" : "पहले", x.baseline]] as [string, string][]) : []),
    [lang === "en" ? "Counting" : "गिनती", x.counting],
  ];
  return (
    <Card title={t("camera", lang)}>
      <dl className="mt-2 space-y-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="font-semibold text-ink">{k}</dt>
            <dd className="text-ink-soft">{v}</dd>
          </div>
        ))}
        {x.checks.length > 0 && (
          <div>
            <dt className="font-semibold text-ink">{lang === "en" ? "Form tips it watches for" : "किन गलतियों पर नज़र रखता है"}</dt>
            <dd>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
                {x.checks.map((c) => (
                  <li key={c.text}>{c.text}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-xs text-ink-soft">
        {lang === "en"
          ? "The camera counts reps and gives tips. It does not confirm that technique is correct."
          : "कैमरा गिनती करता है और सुझाव देता है। यह तकनीक सही होने की पुष्टि नहीं करता।"}
      </p>
    </Card>
  );
}

function HideControl({ exercise, clinic }: { exercise: ExerciseDetail; clinic: string }) {
  const queryClient = useQueryClient();
  const mutation = useSetExerciseVisibility({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetExerciseQueryKey(exercise.slug) });
        void queryClient.invalidateQueries({ queryKey: getListExercisesQueryKey() });
      },
    },
  });
  const failed = mutation.data && mutation.data.status !== 200;
  return (
    <Card title="Admin">
      <p className="text-sm text-ink-soft">
        {exercise.hidden
          ? `Hidden in ${clinic}: clinicians still see it marked Hidden, but can't add it to new plans.`
          : `Shown to clinicians and can be added to plans. Hide it if ${clinic} doesn't use this exercise.`}
      </p>
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ slug: exercise.slug, data: { hidden: !exercise.hidden } })}
        className="mt-3 rounded-xl border border-line px-4 py-2 font-medium hover:bg-canvas disabled:opacity-50"
      >
        {exercise.hidden ? "Show this exercise" : "Hide this exercise"}
      </button>
      {(mutation.isError || failed) && <p className="mt-2 text-sm text-bad">Couldn't save. Try again.</p>}
    </Card>
  );
}
