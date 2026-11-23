import { getGetTodayQueryKey, useGetToday, type Me } from "@kynex/api-client-react";
import { useState } from "react";
import { Link } from "wouter";
import { OfferCard } from "../components/Booking.tsx";
import { LangSwitch } from "../components/LangSwitch.tsx";
import { Card, Shell } from "../components/Shell.tsx";
import { Badge, Button, Loading } from "../components/ui.tsx";
import { failed, ok } from "../lib/api.ts";
import { dateTimeText, weekdaysText } from "../lib/format.ts";
import { useLang } from "../lib/lang.ts";
import { SymptomForm } from "./patient/SessionPlayer.tsx";

/** The patient's day: today's exercises, the start button, visits and offers. */
export function PatientHome({ me }: { me: Me }) {
  const [lang] = useLang();
  const q = useGetToday({ query: { queryKey: getGetTodayQueryKey() } });
  const t = ok(q);
  const [symptom, setSymptom] = useState(false);
  const en = lang === "en";

  return (
    <Shell me={me} title={en ? `Hello, ${me.displayName}` : `नमस्ते, ${me.displayName}`} aside={<LangSwitch />}>
      {!t ? (
        failed(q) ? <p className="text-bad">{failed(q)}</p> : <Loading />
      ) : (
        <>
          {t.offers.map((o) => (
            <OfferCard key={o.id} entry={o} />
          ))}
          {!t.plan ? (
            <Card title={en ? "Today's exercises" : "आज के व्यायाम"} tone="brand">
              <p className="text-white/80">{en ? "Your doctor hasn't set your plan yet. It will appear here once they do." : "आपके डॉक्टर ने अभी योजना नहीं बनाई है। बनते ही यहाँ दिखेगी।"}</p>
            </Card>
          ) : (
            <section className="flex flex-col gap-4 rounded-3xl bg-brand-700 p-5 text-white shadow-soft">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{en ? "Today's exercises" : "आज के व्यायाम"}</h2>
                <p className="text-sm text-white/80">
                  {t.timesPerDay === 0
                    ? en
                      ? "Rest day"
                      : "आराम का दिन"
                    : en
                      ? `${Math.min(t.sessionsDoneToday, t.timesPerDay)} of ${t.timesPerDay} session${t.timesPerDay > 1 ? "s" : ""} done`
                      : `${Math.min(t.sessionsDoneToday, t.timesPerDay)} / ${t.timesPerDay} सेशन पूरे`}
                </p>
              </div>
              {t.plan.note && <p className="rounded-2xl bg-white/10 p-3 text-sm">{t.plan.note}</p>}
              <ol className="flex flex-col gap-2">
                {t.plan.items
                  .filter((i) => i.today || t.timesPerDay === 0)
                  .map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white/10 px-4 py-3">
                      <span>
                        <span className="block font-medium">{i.exercise.name[lang]}</span>
                        <span className="text-sm text-white/75">
                          {i.sets} × {i.reps ? `${i.reps} ${en ? "reps" : "बार"}` : `${i.holdSeconds} ${en ? "s hold" : "सेकंड"}`}
                          {i.side !== "both" ? ` · ${i.side}` : ""}
                        </span>
                      </span>
                      {t.inProgress?.doneItemIds.includes(i.id) && <span aria-label="done">✓</span>}
                    </li>
                  ))}
              </ol>
              <Link href="/session" className="rounded-2xl bg-accent-500 px-5 py-4 text-center text-lg font-semibold hover:bg-accent-600">
                {t.inProgress
                  ? en
                    ? "Continue my session"
                    : "सेशन जारी रखें"
                  : t.sessionsDoneToday >= t.timesPerDay && t.timesPerDay > 0
                    ? en
                      ? "Do an extra session"
                      : "एक और सेशन करें"
                    : en
                      ? "Start today's session"
                      : "आज का सेशन शुरू करें"}
              </Link>
              <p className="text-xs text-white/70">
                {en
                  ? "The camera counts your reps and the phone speaks the count. Your video stays on this phone."
                  : "कैमरा आपके रेप गिनता है और फ़ोन गिनती बोलता है। आपका वीडियो इसी फ़ोन पर रहता है।"}
              </p>
            </section>
          )}

          {t.lastSession && (
            <Card title={en ? "Last session" : "पिछला सेशन"}>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ink-soft">
                  {dateTimeText(t.lastSession.startedAt, lang)} · {t.lastSession.repsFull} {en ? "full reps" : "पूरे रेप"}
                  {t.lastSession.problems ? ` · ${t.lastSession.problems} ${en ? "to improve" : "सुधार के लिए"}` : ""}
                </p>
                {t.lastSession.reviewed && <Badge tone="good">{en ? "Doctor reviewed" : "डॉक्टर ने देखा"}</Badge>}
              </div>
              <Link href={`/reports/${t.lastSession.id}`} className="mt-2 inline-block text-sm font-medium text-brand-700 underline">
                {en ? "See the report" : "रिपोर्ट देखें"}
              </Link>
            </Card>
          )}

          <Card title={en ? "Next visit" : "अगली विज़िट"}>
            {t.nextAppointment ? (
              <p className="mt-1">
                <b>{dateTimeText(t.nextAppointment.startsAt, lang)}</b> · {t.nextAppointment.visitType.name}
                {t.nextAppointment.status === "booked" && <span className="block text-sm text-accent-600">{en ? "Waiting for the clinic to confirm" : "क्लिनिक की पुष्टि का इंतज़ार"}</span>}
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-soft">{en ? "No visit booked." : "कोई विज़िट बुक नहीं है।"}</p>
            )}
            <Link href="/visits" className="mt-2 inline-block text-sm font-medium text-brand-700 underline">
              {en ? "Book or change a visit" : "विज़िट बुक करें या बदलें"}
            </Link>
          </Card>

          {t.plan && (
            <Card title={en ? "My whole plan" : "मेरी पूरी योजना"}>
              <ul className="mt-1 divide-y divide-line text-sm">
                {t.plan.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2 py-2">
                    <span>{i.exercise.name[lang]}</span>
                    <span className="text-ink-soft">{weekdaysText(i.weekdays, lang)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {symptom ? (
            <SymptomForm lang={lang} sessionId={null} onClose={() => setSymptom(false)} />
          ) : (
            <Button tone="plain" onClick={() => setSymptom(true)}>
              {en ? "Report a symptom to my clinic" : "क्लिनिक को लक्षण बताइए"}
            </Button>
          )}
        </>
      )}
    </Shell>
  );
}
