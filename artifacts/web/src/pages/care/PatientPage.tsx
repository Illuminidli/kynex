import {
  acknowledgeSymptom,
  addNote,
  getGetPatientQueryKey,
  getListWaitlistQueryKey,
  useGetPatient,
  useListWaitlist,
  type Appointment,
  type Me,
  type PatientOverview,
} from "@kynex/api-client-react";
import { useState } from "react";
import { Link } from "wouter";
import { AppointmentCard, BookingForm, WaitlistForm, WaitlistRow } from "../../components/Booking.tsx";
import { AdherenceGrid, LineChart, Stat } from "../../components/Charts.tsx";
import { PlanEditor, PlanView } from "../../components/PlanEditor.tsx";
import { Card, Shell } from "../../components/Shell.tsx";
import { ATTENTION_TONE, Badge, Button, ErrorText, inputCls, Loading, Notice, Tabs } from "../../components/ui.tsx";
import { failed, must, ok, useAction } from "../../lib/api.ts";
import { ago, dateText, dateTimeText, unitText } from "../../lib/format.ts";

type Tab = "overview" | "plan" | "sessions" | "symptoms" | "visits" | "activity";

/** Everything about one patient, for their doctor (and the admin). */
export function PatientPage({ me, patientId }: { me: Me; patientId: string }) {
  const q = useGetPatient(patientId, { query: { queryKey: getGetPatientQueryKey(patientId) } });
  const o = ok(q);
  const [tab, setTab] = useState<Tab>("overview");
  const back = { href: "/", label: me.role === "admin" ? "Overview" : "My patients" };
  if (!o) {
    return (
      <Shell me={me} title="Patient" back={back} wide>
        {failed(q) ? <p className="text-bad">{failed(q)}</p> : <Loading />}
      </Shell>
    );
  }
  const openSymptoms = o.symptoms.filter((s) => !s.acknowledgedAt).length;
  const toReview = o.sessions.filter((s) => !s.reviewed && s.status !== "in-progress").length;
  return (
    <Shell me={me} title={o.patient.displayName} back={back} wide aside={<span className="text-sm text-ink-soft">{o.patient.email}</span>}>
      {o.attention.length > 0 && (
        <ul className="-mt-2 flex flex-wrap gap-1.5">
          {o.attention.map((a, i) => (
            <li key={i}>
              <Badge tone={ATTENTION_TONE[a.kind]}>
                {a.kind === "red-flag" ? "🚩 " : ""}
                {a.text}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { key: "overview", label: "Overview" },
          { key: "plan", label: "Plan" },
          { key: "sessions", label: "Sessions", count: toReview },
          { key: "symptoms", label: "Symptoms & notes", count: openSymptoms },
          { key: "visits", label: "Visits" },
          { key: "activity", label: "Activity" },
        ]}
      />
      {tab === "overview" && <Overview o={o} />}
      {tab === "plan" && <PlanTab o={o} />}
      {tab === "sessions" && <SessionsTab o={o} />}
      {tab === "symptoms" && <SymptomsTab o={o} patientId={patientId} />}
      {tab === "visits" && <VisitsTab o={o} me={me} />}
      {tab === "activity" && <ActivityList items={o.activity} />}
    </Shell>
  );
}

function Overview({ o }: { o: PatientOverview }) {
  const last = o.sessions[0];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sessions done (14 days)" value={o.adherencePercent === null ? "–" : `${o.adherencePercent}%`} tone={o.adherencePercent !== null && o.adherencePercent < 50 ? "bad" : undefined} />
        <Stat label="Last session" value={last ? ago(last.startedAt) : "None yet"} />
        <Stat label="Pain at last session" value={last ? `${last.painBefore ?? "–"} → ${last.painAfter ?? "–"}` : "–"} note="before → after, out of 10" />
        <Stat label="Form score, last session" value={last?.quality ?? "–"} note="out of 100" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Last 4 weeks">
          <div className="mt-2">
            <AdherenceGrid days={o.adherence} />
          </div>
        </Card>
        <Card>
          <LineChart
            title="Pain, out of 10"
            yMax={10}
            series={[
              { name: "Before session", points: o.pain.map((p) => ({ x: p.day, y: p.before })) },
              { name: "After session", points: o.pain.map((p) => ({ x: p.day, y: p.after })) },
            ]}
          />
        </Card>
      </div>
      {o.rom.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          {o.rom.map((r) => (
            <Card key={r.slug}>
              <LineChart
                title={`${r.name.en}: best range per session`}
                unit={r.unit}
                goal={r.goal !== null ? { value: r.goal, label: `Target ${Math.round(r.goal)}${unitText(r.unit)}` } : undefined}
                series={[{ name: r.name.en, points: r.points.map((p) => ({ x: p.day, y: p.best })) }]}
              />
            </Card>
          ))}
        </div>
      )}
      {!o.sessions.length && <Notice>No sessions yet. Results appear here after {o.patient.displayName} does their first session.</Notice>}
    </div>
  );
}

function PlanTab({ o }: { o: PatientOverview }) {
  const [editing, setEditing] = useState(!o.plan);
  const [saved, setSaved] = useState(false);
  return (
    <Card title={editing ? (o.plan ? "Change the plan" : "Make a plan") : "Plan"}>
      <div className="mt-3 flex flex-col gap-3">
        {saved && !editing && <Notice>Plan saved. {o.patient.displayName} sees it on their phone now.</Notice>}
        {editing ? (
          <PlanEditor
            patientId={o.patient.id}
            plan={o.plan}
            onSaved={() => {
              setEditing(false);
              setSaved(true);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : o.plan ? (
          <>
            <PlanView plan={o.plan} />
            <Button className="self-start" onClick={() => setEditing(true)}>
              Change the plan
            </Button>
            <p className="text-xs text-ink-faint">Every change is saved with who made it and when (see Activity).</p>
          </>
        ) : null}
      </div>
    </Card>
  );
}

function SessionsTab({ o }: { o: PatientOverview }) {
  if (!o.sessions.length) return <Notice>No sessions yet.</Notice>;
  return (
    <Card>
      <ul className="divide-y divide-line">
        {o.sessions.map((s) => (
          <li key={s.id}>
            <Link href={`/sessions/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-canvas">
              <span>
                <span className="font-medium">{dateTimeText(s.startedAt)}</span>
                <span className="block text-sm text-ink-soft">
                  {s.status === "red-flag"
                    ? "Stopped at the check-in (red flag)"
                    : `${s.exercises} exercises · ${s.repsFull} full reps${s.repsPartial ? `, ${s.repsPartial} partial` : ""}${s.holds ? ` · ${s.holds} holds` : ""} · pain ${s.painBefore ?? "–"} → ${s.painAfter ?? "–"}`}
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {s.problems > 0 && <Badge tone="warn">⚠ {s.problems} form problems</Badge>}
                {s.status === "stopped" && <Badge tone="warn">Stopped early</Badge>}
                {s.status === "red-flag" && <Badge tone="bad">🚩 Red flag</Badge>}
                {s.reviewed ? <Badge tone="good">Reviewed</Badge> : s.status !== "in-progress" && <Badge>To review</Badge>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const FLAG: Record<string, string> = {
  numbness: "New numbness or tingling",
  bladder: "Bladder or bowel changes",
  chest: "Chest pain or breathlessness",
  fall: "A fall or injury",
  severe: "Severe new pain",
};

function SymptomsTab({ o, patientId }: { o: PatientOverview; patientId: string }) {
  const act = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Symptom reports">
        {!o.symptoms.length ? (
          <p className="mt-2 text-sm text-ink-soft">None reported.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {o.symptoms.map((s) => (
              <li key={s.id} className={`rounded-2xl border p-3 ${s.acknowledgedAt ? "border-line" : s.redFlags.length ? "border-bad bg-bad-soft" : "border-accent-500 bg-accent-50"}`}>
                <p className="text-sm font-medium">
                  {dateTimeText(s.createdAt)} · {s.source === "check-in" ? "At the check-in" : s.source === "session" ? "During a session" : "From home"}
                  {s.pain !== null ? ` · pain ${s.pain}/10` : ""}
                </p>
                {s.redFlags.length > 0 && <p className="text-sm text-bad">🚩 {s.redFlags.map((f) => FLAG[f] ?? f).join(", ")}</p>}
                {s.text && <p className="text-sm">"{s.text}"</p>}
                {s.acknowledgedAt ? (
                  <p className="text-xs text-ink-faint">
                    Read by {s.acknowledgedByName ?? "the clinic"}, {dateTimeText(s.acknowledgedAt)}
                  </p>
                ) : (
                  <Button className="mt-2" disabled={act.busy} onClick={() => act.run(() => must(acknowledgeSymptom(s.id)))}>
                    Mark as read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Doctor's notes">
        <div className="mt-2 flex flex-col gap-2">
          <textarea className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (only the clinic sees it)" maxLength={2000} />
          <ErrorText>{act.error}</ErrorText>
          <Button
            className="self-start"
            disabled={act.busy || !note.trim()}
            onClick={async () => {
              if (await act.run(() => must(addNote(patientId, { text: note })))) setNote("");
            }}
          >
            Add note
          </Button>
          <ul className="flex flex-col divide-y divide-line">
            {o.notes.map((n) => (
              <li key={n.id} className="py-2 text-sm">
                <p className="whitespace-pre-wrap">{n.text}</p>
                <p className="text-xs text-ink-faint">
                  {n.authorName ?? "Someone"}, {dateTimeText(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function VisitsTab({ o, me }: { o: PatientOverview; me: Me }) {
  const [mode, setMode] = useState<"list" | "book" | "wait">("list");
  const [moving, setMoving] = useState<Appointment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const waitQ = useListWaitlist({ query: { queryKey: getListWaitlistQueryKey() } });
  const waiting = (ok(waitQ)?.entries ?? []).filter((e) => e.patient.id === o.patient.id);
  const done = (msg: string) => {
    setNotice(msg);
    setMode("list");
    setMoving(null);
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Upcoming visits">
        <div className="mt-2 flex flex-col gap-2">
          {notice && <Notice>{notice}</Notice>}
          {!o.appointments.length && <p className="text-sm text-ink-soft">No visits booked.</p>}
          {o.appointments.map((a) => (
            <AppointmentCard key={a.id} a={a} me={me} onMove={(x) => (setMoving(x), setMode("book"))} />
          ))}
          {waiting.length > 0 && (
            <>
              <p className="mt-2 text-sm font-semibold">Waiting list</p>
              <ul className="divide-y divide-line">
                {waiting.map((w) => (
                  <WaitlistRow key={w.id} entry={w} />
                ))}
              </ul>
            </>
          )}
          <div className="flex gap-2">
            <Button onClick={() => (setMoving(null), setMode("book"))}>Book a visit</Button>
            <Button tone="plain" onClick={() => setMode("wait")}>
              Add to waiting list
            </Button>
          </div>
        </div>
      </Card>
      {mode !== "list" && (
        <Card title={moving ? `Move the visit of ${dateText(moving.startsAt)}` : mode === "book" ? "Book a visit" : "Waiting list"}>
          <div className="mt-3">
            {mode === "book" ? (
              <BookingForm me={me} patientId={o.patient.id} moving={moving ?? undefined} onDone={done} />
            ) : (
              <WaitlistForm me={me} patientId={o.patient.id} onDone={done} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export function ActivityList({ items }: { items: PatientOverview["activity"] }) {
  if (!items.length) return <Notice>Nothing yet.</Notice>;
  return (
    <Card>
      <ul className="divide-y divide-line">
        {items.map((a) => (
          <li key={a.id} className="flex flex-col gap-0.5 py-2.5">
            <p className="text-sm">{a.summary}</p>
            <p className="flex flex-wrap gap-2 text-xs text-ink-faint">
              <span>{dateTimeText(a.createdAt)}</span>
              <Badge tone="plain">{a.area}</Badge>
              {a.sessionId && (
                <Link href={`/sessions/${a.sessionId}`} className="text-brand-700 underline">
                  Open session
                </Link>
              )}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

