import {
  finishSession,
  getGetTodayQueryKey,
  reportSymptom,
  saveSessionExercise,
  startSession,
  useGetToday,
  type CheckInFlag,
  type Me,
  type PlanItem,
} from "@kynex/api-client-react";
import { explainExercise, getExercise } from "@kynex/motion";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { ExerciseRun, type RunOutput } from "../../components/ExerciseRun.tsx";
import { LangSwitch } from "../../components/LangSwitch.tsx";
import { Button, ErrorText, FEELINGS, inputCls, Loading, PainScale } from "../../components/ui.tsx";
import { must, ok } from "../../lib/api.ts";
import { doseText } from "../../lib/labels.ts";
import { useLang } from "../../lib/lang.ts";
import { saveVideo } from "../../lib/videos.ts";
import { canSpeak, speak, stopSpeaking } from "../../lib/voice.ts";

type Lang = "en" | "hi";
const W = (en: string, hi: string) => ({ en, hi });

/** Check-in questions (drafts until QI Spine's physios approve them). Any "yes" stops the session. */
export const RED_FLAG_QUESTIONS: { id: CheckInFlag; en: string; hi: string }[] = [
  { id: "numbness", en: "New numbness, tingling or weakness in your arms or legs?", hi: "हाथ या पैरों में नया सुन्नपन, झनझनाहट या कमज़ोरी?" },
  { id: "bladder", en: "Any new problem controlling your bladder or bowels?", hi: "पेशाब या शौच पर नियंत्रण में कोई नई समस्या?" },
  { id: "chest", en: "Chest pain, or unusual breathlessness?", hi: "सीने में दर्द, या असामान्य साँस फूलना?" },
  { id: "fall", en: "A fall or injury since your last session?", hi: "पिछले सेशन के बाद कोई गिरना या चोट?" },
  { id: "severe", en: "Severe pain that is new or much worse than usual?", hi: "बहुत तेज़ दर्द जो नया है या पहले से बहुत ज़्यादा है?" },
];

type Step =
  | { kind: "checkin" }
  | { kind: "red-flag" }
  | { kind: "intro"; index: number }
  | { kind: "run"; index: number; mode: "camera" | "manual" }
  | { kind: "feeling"; index: number; out: RunOutput }
  | { kind: "after" };

export function SessionPlayer({ me: _me }: { me: Me }) {
  const todayQ = useGetToday({ query: { queryKey: getGetTodayQueryKey(), staleTime: Infinity, refetchOnWindowFocus: false } });
  const today = ok(todayQ);
  const [lang] = useLang();
  if (!today) return <Frame lang={lang}>{todayQ.isError ? <p>Can't reach Kynex.</p> : <Loading />}</Frame>;
  if (!today.plan?.items.length) {
    return (
      <Frame lang={lang}>
        <p>{lang === "en" ? "Your doctor hasn't set your exercises yet." : "आपके डॉक्टर ने अभी व्यायाम तय नहीं किए हैं।"}</p>
      </Frame>
    );
  }
  // Today's exercises (or, on a rest day, the whole plan), minus any already done in an unfinished session.
  const due = today.plan.items.filter((i) => i.today);
  const done = new Set(today.inProgress?.doneItemIds ?? []);
  const items = (due.length ? due : today.plan.items).filter((i) => !done.has(i.id));
  return <Player items={items} resumeId={today.inProgress?.id ?? null} lang={lang} />;
}

function Player({ items, resumeId, lang }: { items: PlanItem[]; resumeId: string | null; lang: Lang }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(resumeId);
  const [step, setStep] = useState<Step>(resumeId ? (items.length ? { kind: "intro", index: 0 } : { kind: "after" }) : { kind: "checkin" });
  const [voiceOn, setVoiceOn] = useState(true);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stoppedEarly, setStoppedEarly] = useState(false);

  const say = (t: { en: string; hi: string }) => voiceOn && speak(t, lang);
  const next = (index: number) => (index + 1 < items.length ? setStep({ kind: "intro", index: index + 1 }) : setStep({ kind: "after" }));

  async function end(status: "completed" | "stopped", painAfter: number | null) {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      await must(finishSession(sessionId, { painAfter, status }));
      stopSpeaking();
      await qc.invalidateQueries();
      navigate(`/reports/${sessionId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveResult(index: number, out: RunOutput, feeling: string) {
    const item = items[index]!;
    setBusy(true);
    setError(null);
    try {
      const saved = await must(saveSessionExercise(sessionId!, { ...out.result, itemId: item.id, exerciseSlug: item.exercise.slug, feeling: (feeling || null) as never }));
      // The video stays on this phone, filed under the saved result.
      if (out.video) await saveVideo({ id: saved.id, ...out.video, savedAt: Date.now() });
      next(index);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------- check-in */
  if (step.kind === "checkin") return <CheckIn lang={lang} onStart={async (pain, flags) => {
    setBusy(true);
    setError(null);
    try {
      // Speaking inside the tap unlocks the voice on iPhones.
      say(W("Let's begin.", "चलिए शुरू करते हैं।"));
      const s = await must(startSession({ pain, redFlags: flags }));
      setSessionId(s.id);
      setStep(s.stopped ? { kind: "red-flag" } : { kind: "intro", index: 0 });
      if (s.stopped) await qc.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }} busy={busy} error={error} />;

  if (step.kind === "red-flag") {
    return (
      <Frame lang={lang}>
        <h1 className="text-2xl font-semibold">{lang === "en" ? "Please don't exercise today" : "कृपया आज व्यायाम न करें"}</h1>
        <p className="rounded-2xl bg-bad p-4 text-white">
          {lang === "en"
            ? "One of your answers can be a warning sign. Your clinic has been told. Please call the clinic before exercising again. If it feels urgent, go to the nearest emergency department."
            : "आपका एक जवाब चेतावनी का संकेत हो सकता है। आपके क्लिनिक को बता दिया गया है। दोबारा व्यायाम से पहले क्लिनिक को फ़ोन कीजिए। अगर स्थिति गंभीर लगे, तो नज़दीकी इमरजेंसी में जाइए।"}
        </p>
        <Button tone="plain" onClick={() => navigate("/")}>
          {lang === "en" ? "Back to home" : "होम पर वापस"}
        </Button>
      </Frame>
    );
  }

  /* ---------------------------------------------------------- one exercise */
  if (step.kind === "intro" || step.kind === "run" || step.kind === "feeling") {
    const item = items[step.index]!;
    const def = getExercise(item.exercise.slug);
    if (!def) return <Frame lang={lang}>Unknown exercise.</Frame>;
    if (step.kind === "run") {
      return (
        <ExerciseRun
          key={`${step.index}-${step.mode}`}
          def={def}
          item={item}
          mode={step.mode}
          facing={facing}
          lang={lang}
          voiceOn={voiceOn}
          setVoiceOn={setVoiceOn}
          onFinish={(out) => setStep({ kind: "feeling", index: step.index, out })}
        />
      );
    }
    if (step.kind === "feeling") {
      const r = step.out.result;
      return (
        <Frame lang={lang} sessionId={sessionId}>
          <p className="text-sm text-brand-100">
            {lang === "en" ? `Exercise ${step.index + 1} of ${items.length}` : `व्यायाम ${step.index + 1} / ${items.length}`}
          </p>
          <h1 className="text-2xl font-semibold">{def.name[lang]}</h1>
          <p className="text-brand-50">
            {def.kind === "reps"
              ? lang === "en"
                ? `${r.repsFull} full rep${r.repsFull === 1 ? "" : "s"}${r.repsPartial ? `, ${r.repsPartial} partial` : ""}.`
                : `${r.repsFull} पूरे रेप${r.repsPartial ? `, ${r.repsPartial} आधे` : ""}।`
              : lang === "en"
                ? `${r.holdsDone} hold${r.holdsDone === 1 ? "" : "s"} done.`
                : `${r.holdsDone} होल्ड पूरे।`}
          </p>
          <h2 className="text-lg font-semibold">{lang === "en" ? "How did it feel?" : "कैसा लगा?"}</h2>
          <div className="grid grid-cols-2 gap-2">
            {FEELINGS.map((f) => (
              <button
                key={f.key}
                type="button"
                disabled={busy}
                onClick={() => saveResult(step.index, step.out, f.key)}
                className={`rounded-2xl px-4 py-5 text-lg font-semibold disabled:opacity-50 ${f.key === "painful" ? "bg-bad" : "bg-white/15"}`}
              >
                {f[lang]}
              </button>
            ))}
          </div>
          {busy && <p className="text-sm text-brand-100">{lang === "en" ? "Saving…" : "सेव हो रहा है…"}</p>}
          <ErrorText>{error}</ErrorText>
          {step.out.video && (
            <p className="text-xs text-brand-100">
              {lang === "en" ? "Your video is kept on this phone only. Kynex saves the counts and your movement (no picture)." : "आपका वीडियो सिर्फ़ इसी फ़ोन पर रहता है। Kynex केवल गिनती और आपकी गति (बिना तस्वीर) सेव करता है।"}
            </p>
          )}
        </Frame>
      );
    }
    const x = explainExercise(def, lang);
    return (
      <Frame lang={lang} sessionId={sessionId} onStop={() => (setStoppedEarly(true), setStep({ kind: "after" }))}>
        <p className="text-sm text-brand-100">{lang === "en" ? `Exercise ${step.index + 1} of ${items.length}` : `व्यायाम ${step.index + 1} / ${items.length}`}</p>
        <h1 className="text-2xl font-semibold">{def.name[lang]}</h1>
        <p className="rounded-2xl bg-white/10 p-3 font-medium">
          {doseText({ sets: item.sets, reps: item.reps ?? undefined, holdSeconds: item.holdSeconds ?? undefined, restSeconds: item.restSeconds }, lang)}
          {def.laterality === "unilateral" ? (item.side === "both" ? (lang === "en" ? " · each side" : " · दोनों तरफ़") : ` · ${item.side}`) : ""}
        </p>
        {item.note && <p className="rounded-2xl bg-accent-500/20 p-3 text-sm">{item.note}</p>}
        <ol className="list-decimal space-y-2 pl-5 text-brand-50">
          <li>{x.camera}</li>
          <li>{x.inView}</li>
          <li>{def.setup[lang]}</li>
          {def.steps.map((s, i) => (
            <li key={i}>{s[lang]}</li>
          ))}
        </ol>
        {def.precautions.length > 0 && (
          <p className="text-sm text-accent-500">
            {lang === "en" ? "Take care: " : "सावधानी: "}
            {def.precautions.map((p) => p[lang]).join(" ")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {(["user", "environment"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={facing === f} onClick={() => setFacing(f)} className={`rounded-xl px-3 py-2 text-sm ${facing === f ? "bg-white text-brand-900" : "bg-white/10"}`}>
              {f === "user" ? (lang === "en" ? "Front camera" : "सामने का कैमरा") : lang === "en" ? "Back camera" : "पीछे का कैमरा"}
            </button>
          ))}
          <button type="button" aria-pressed={voiceOn} onClick={() => setVoiceOn(!voiceOn)} className={`rounded-xl px-3 py-2 text-sm ${voiceOn ? "bg-white text-brand-900" : "bg-white/10"}`}>
            {lang === "en" ? `Voice ${voiceOn ? "on" : "off"}` : `आवाज़ ${voiceOn ? "चालू" : "बंद"}`}
          </button>
        </div>
        {!canSpeak() && <p className="text-sm text-accent-500">{lang === "en" ? "This browser can't speak; counts show on screen." : "यह ब्राउज़र बोल नहीं सकता; गिनती स्क्रीन पर दिखेगी।"}</p>}
        <button
          type="button"
          onClick={() => {
            say(W("Starting the camera.", "कैमरा शुरू हो रहा है।"));
            setStep({ kind: "run", index: step.index, mode: "camera" });
          }}
          className="rounded-2xl bg-accent-500 px-5 py-4 text-lg font-semibold"
        >
          {lang === "en" ? "Start with the camera" : "कैमरे के साथ शुरू करें"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <Button tone="plain" className="!bg-white/10 !text-white !border-white/20" onClick={() => setStep({ kind: "run", index: step.index, mode: "manual" })}>
            {lang === "en" ? "Count by tapping" : "टैप करके गिनें"}
          </Button>
          <Button
            tone="plain"
            className="!bg-white/10 !text-white !border-white/20"
            disabled={busy}
            onClick={() =>
              saveResult(
                step.index,
                {
                  result: { mode: "manual", status: "skipped", setsDone: 0, repsFull: 0, repsPartial: 0, holdsDone: 0, best: null, quality: null, reps: [], holds: [], faultCounts: {}, visibleRatio: null, videoOnPhone: false, durationSeconds: 0, track: null },
                  video: null,
                },
                "",
              )
            }
          >
            {lang === "en" ? "Skip this one" : "इसे छोड़ें"}
          </Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </Frame>
    );
  }

  /* ---------------------------------------------------------- after */
  return <After lang={lang} busy={busy} error={error} onDone={(pain) => end(stoppedEarly ? "stopped" : "completed", pain)} />;
}

function CheckIn({ lang, onStart, busy, error }: { lang: Lang; onStart: (pain: number, flags: CheckInFlag[]) => void; busy: boolean; error: string | null }) {
  const [pain, setPain] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const all = RED_FLAG_QUESTIONS.every((q) => q.id in answers);
  return (
    <Frame lang={lang}>
      <h1 className="text-2xl font-semibold">{lang === "en" ? "Before you start" : "शुरू करने से पहले"}</h1>
      <div className="rounded-2xl bg-white p-4 text-ink">
        <p className="mb-2 font-semibold">{lang === "en" ? "How much pain do you have right now?" : "अभी आपको कितना दर्द है?"}</p>
        <PainScale value={pain} onChange={setPain} lang={lang} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-semibold">{lang === "en" ? "Since your last session, have you had…" : "पिछले सेशन के बाद, क्या आपको…"}</p>
        {RED_FLAG_QUESTIONS.map((q) => (
          <div key={q.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/10 p-3">
            <span className="text-sm">{q[lang]}</span>
            <span className="flex shrink-0 gap-1">
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={answers[q.id] === v}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${answers[q.id] === v ? (v ? "bg-bad text-white" : "bg-white text-brand-900") : "bg-white/10"}`}
                >
                  {v ? (lang === "en" ? "Yes" : "हाँ") : lang === "en" ? "No" : "नहीं"}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <button
        type="button"
        disabled={pain === null || !all || busy}
        onClick={() => onStart(pain!, RED_FLAG_QUESTIONS.filter((q) => answers[q.id]).map((q) => q.id))}
        className="rounded-2xl bg-accent-500 px-5 py-4 text-lg font-semibold disabled:opacity-40"
      >
        {lang === "en" ? "Start today's session" : "आज का सेशन शुरू करें"}
      </button>
      <p className="text-xs text-brand-100">{lang === "en" ? "These questions are drafts until QI Spine's physiotherapists approve them." : "ये प्रश्न QI Spine के फ़िज़ियोथेरेपिस्ट की मंज़ूरी तक प्रारंभिक हैं।"}</p>
    </Frame>
  );
}

function After({ lang, busy, error, onDone }: { lang: Lang; busy: boolean; error: string | null; onDone: (pain: number | null) => void }) {
  const [pain, setPain] = useState<number | null>(null);
  return (
    <Frame lang={lang}>
      <h1 className="text-2xl font-semibold">{lang === "en" ? "Well done!" : "बहुत बढ़िया!"}</h1>
      <div className="rounded-2xl bg-white p-4 text-ink">
        <p className="mb-2 font-semibold">{lang === "en" ? "How much pain do you have now?" : "अब आपको कितना दर्द है?"}</p>
        <PainScale value={pain} onChange={setPain} lang={lang} />
      </div>
      <ErrorText>{error}</ErrorText>
      <button type="button" disabled={pain === null || busy} onClick={() => onDone(pain)} className="rounded-2xl bg-accent-500 px-5 py-4 text-lg font-semibold disabled:opacity-40">
        {lang === "en" ? "Finish and see my report" : "पूरा करें और रिपोर्ट देखें"}
      </button>
    </Frame>
  );
}

/** Dark full-screen frame for the session, with "Report a symptom" and Stop on every screen. */
function Frame({ lang, children, sessionId, onStop }: { lang: Lang; children: React.ReactNode; sessionId?: string | null; onStop?: () => void }) {
  const [, navigate] = useLocation();
  const [symptom, setSymptom] = useState(false);
  return (
    <main className="min-h-dvh bg-brand-900 text-white">
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-6">
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="text-sm font-medium text-brand-100" onClick={() => (onStop ? onStop() : navigate("/"))}>
            {onStop ? (lang === "en" ? "■ Stop session" : "■ सेशन रोकें") : lang === "en" ? "← Home" : "← होम"}
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSymptom(true)} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm">
              {lang === "en" ? "Report a symptom" : "लक्षण बताइए"}
            </button>
            <LangSwitch dark />
          </div>
        </div>
        {symptom && <SymptomForm lang={lang} sessionId={sessionId ?? null} onClose={() => setSymptom(false)} />}
        {children}
      </div>
    </main>
  );
}

export function SymptomForm({ lang, sessionId, onClose }: { lang: Lang; sessionId: string | null; onClose: () => void }) {
  const [pain, setPain] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<"edit" | "busy" | "sent">("edit");
  const [error, setError] = useState<string | null>(null);
  if (state === "sent") {
    return (
      <div className="rounded-2xl bg-white p-4 text-ink">
        <p className="font-semibold">{lang === "en" ? "Sent to your clinic." : "आपके क्लिनिक को भेज दिया गया।"}</p>
        <p className="text-sm text-ink-soft">{lang === "en" ? "If it's severe or urgent, stop and call the clinic." : "अगर यह गंभीर है, तो रुकिए और क्लिनिक को फ़ोन कीजिए।"}</p>
        <Button className="mt-2" onClick={onClose}>
          OK
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 text-ink">
      <p className="font-semibold">{lang === "en" ? "What are you feeling?" : "आप क्या महसूस कर रहे हैं?"}</p>
      <textarea className={inputCls} rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
      <p className="text-sm font-medium">{lang === "en" ? "Pain now (optional)" : "अभी दर्द (वैकल्पिक)"}</p>
      <PainScale value={pain} onChange={setPain} lang={lang} />
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button
          disabled={state === "busy" || (!text.trim() && pain === null)}
          onClick={async () => {
            setState("busy");
            try {
              await must(reportSymptom({ pain, text, sessionId }));
              setState("sent");
            } catch (e) {
              setError((e as Error).message);
              setState("edit");
            }
          }}
        >
          {lang === "en" ? "Send to my clinic" : "क्लिनिक को भेजें"}
        </Button>
        <Button tone="plain" onClick={onClose}>
          {lang === "en" ? "Cancel" : "रद्द करें"}
        </Button>
      </div>
    </div>
  );
}
