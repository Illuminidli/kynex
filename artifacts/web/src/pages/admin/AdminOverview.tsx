import { getGetOverviewQueryKey, useGetOverview, type Me } from "@kynex/api-client-react";
import { Link } from "wouter";
import { Stat } from "../../components/Charts.tsx";
import { Card, Shell } from "../../components/Shell.tsx";
import { Badge, Loading } from "../../components/ui.tsx";
import { failed, ok } from "../../lib/api.ts";
import { ago, timeText } from "../../lib/format.ts";
import { PatientCard } from "../care/DoctorHome.tsx";
import { statusBadge } from "../../components/Booking.tsx";

/** The admin's view of the whole clinic. */
export function AdminOverview({ me }: { me: Me }) {
  const q = useGetOverview({ query: { queryKey: getGetOverviewQueryKey(), refetchInterval: 60_000 } });
  const o = ok(q);
  return (
    <Shell me={me} title={`${me.clinic.name}: overview`} wide>
      {!o ? (
        failed(q) ? <p className="text-bad">{failed(q)}</p> : <Loading />
      ) : (
        <>
          <section aria-label="Today's numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Sessions today" value={o.counts.sessionsToday} note={`${o.counts.sessionsWeek} in the last 7 days`} />
            <Stat label="Sessions done vs planned" value={o.counts.adherence7 === null ? "–" : `${o.counts.adherence7}%`} note="all patients, last 7 days" tone={o.counts.adherence7 !== null && o.counts.adherence7 < 50 ? "bad" : undefined} />
            <Stat label="Need attention" value={o.counts.openAlerts} note={`${o.counts.openSymptoms} symptom report${o.counts.openSymptoms === 1 ? "" : "s"} unread`} tone={o.counts.openAlerts ? "bad" : undefined} />
            <Stat label="Visits today" value={o.counts.appointmentsToday} note={`${o.counts.waiting} on the waiting list`} />
            <Stat label="Patients" value={o.counts.patients} note={`${o.counts.clinicians} doctor${o.counts.clinicians === 1 ? "" : "s"}`} />
            <Stat label="No-shows" value={o.counts.noShows30} note="last 30 days" />
            <Stat label="Cancellations" value={o.counts.cancellations30} note="last 30 days" />
          </section>

          <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Patients</h2>
              {o.patients.map((p) => (
                <PatientCard key={p.id} p={p} />
              ))}
            </div>
            <div className="flex flex-col gap-5">
              <Card title="Today's visits">
                {!o.today.length ? (
                  <p className="mt-1 text-sm text-ink-soft">None today.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line">
                    {o.today.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span>
                          <b>{timeText(a.startsAt)}</b> {a.patient.displayName} · {a.visitType.name} · {a.clinician.displayName}
                        </span>
                        {statusBadge(a.status)}
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/calendar" className="mt-2 inline-block text-sm font-medium text-brand-700 underline">
                  Clinic calendar
                </Link>
              </Card>
              <Card title="Latest activity">
                <ul className="mt-2 divide-y divide-line">
                  {o.recent.map((a) => (
                    <li key={a.id} className="py-2 text-sm">
                      <p>{a.summary}</p>
                      <p className="flex gap-2 text-xs text-ink-faint">
                        {ago(a.createdAt)} <Badge tone="plain">{a.area}</Badge>
                      </p>
                    </li>
                  ))}
                </ul>
                <Link href="/activity" className="mt-2 inline-block text-sm font-medium text-brand-700 underline">
                  All activity, with filters
                </Link>
              </Card>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
