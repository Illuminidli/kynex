import { getListAppointmentsQueryKey, getListPatientsQueryKey, useListAppointments, useListPatients, type Me, type PatientRow } from "@kynex/api-client-react";
import { Link } from "wouter";
import { AppointmentCard } from "../../components/Booking.tsx";
import { Card, LibraryLink, Shell } from "../../components/Shell.tsx";
import { ATTENTION_TONE, Badge, Loading } from "../../components/ui.tsx";
import { failed, ok } from "../../lib/api.ts";
import { ago, dateTimeText, todayDay } from "../../lib/format.ts";

/** The doctor's start page: patients, most urgent first, and today's visits. */
export function DoctorHome({ me }: { me: Me }) {
  const patientsQ = useListPatients({ query: { queryKey: getListPatientsQueryKey(), refetchInterval: 60_000 } });
  const day = todayDay();
  const visitsQ = useListAppointments({ from: day, to: day }, { query: { queryKey: getListAppointmentsQueryKey({ from: day, to: day }) } });
  const patients = ok(patientsQ)?.patients;
  const visits = (ok(visitsQ)?.appointments ?? []).filter((a) => a.status !== "cancelled");
  const needs = patients?.filter((p) => p.attention.some((a) => a.kind !== "review")).length ?? 0;

  return (
    <Shell me={me} title="My patients" wide>
      <p className="-mt-2 text-sm text-ink-soft">
        {patients ? `${patients.length} patients · ${needs ? `${needs} need${needs === 1 ? "s" : ""} attention` : "nothing urgent"}` : ""}
      </p>
      {failed(patientsQ) && <p className="text-bad">{failed(patientsQ)}</p>}
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-3">
          {!patients ? <Loading /> : patients.map((p) => <PatientCard key={p.id} p={p} />)}
        </div>
        <div className="flex flex-col gap-3">
          <Card title="Today's visits">
            {!visits.length ? (
              <p className="text-sm text-ink-soft">No visits today.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {visits.map((a) => (
                  <AppointmentCard key={a.id} a={a} me={me} showPatient />
                ))}
              </div>
            )}
            <Link href="/calendar" className="mt-3 inline-block text-sm font-medium text-brand-700 underline">
              Open the calendar
            </Link>
          </Card>
          <LibraryLink />
        </div>
      </div>
    </Shell>
  );
}

export function PatientCard({ p }: { p: PatientRow }) {
  return (
    <Link href={`/patients/${p.id}`} className="flex flex-col gap-2 rounded-3xl bg-white p-5 shadow-soft hover:ring-2 hover:ring-brand-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{p.displayName}</p>
          <p className="text-sm text-ink-soft">
            {p.hasPlan ? `${p.exercises} exercise${p.exercises === 1 ? "" : "s"} in plan` : "No plan yet"}
            {p.lastSessionAt ? ` · last session ${ago(p.lastSessionAt)}` : " · no sessions yet"}
            {p.clinicianName ? ` · ${p.clinicianName}` : ""}
          </p>
        </div>
        {p.adherence !== null && (
          <span className="text-right">
            <span className={`block text-2xl font-semibold tabular-nums ${p.adherence < 50 ? "text-bad" : p.adherence >= 80 ? "text-good" : ""}`}>{p.adherence}%</span>
            <span className="text-xs text-ink-faint">sessions done, 14 days</span>
          </span>
        )}
      </div>
      {p.attention.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {p.attention.map((a, i) => (
            <li key={i}>
              <Badge tone={ATTENTION_TONE[a.kind]}>
                {a.kind === "red-flag" ? "🚩 " : a.kind === "review" ? "" : "⚠ "}
                {a.text}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {!p.hasPlan && <p className="text-sm font-medium text-brand-700">Make a plan →</p>}
      {p.nextAppointment && <p className="text-xs text-ink-faint">Next visit: {dateTimeText(p.nextAppointment.startsAt)}</p>}
    </Link>
  );
}
