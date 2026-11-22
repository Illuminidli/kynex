import {
  getListAppointmentsQueryKey,
  getListPatientsQueryKey,
  getListWaitlistQueryKey,
  useListAppointments,
  useListPatients,
  useListWaitlist,
  type Appointment,
  type Me,
} from "@kynex/api-client-react";
import { useState } from "react";
import { AppointmentCard, BookingForm, WaitlistRow } from "../../components/Booking.tsx";
import { Card, Shell } from "../../components/Shell.tsx";
import { Button, Loading, Notice } from "../../components/ui.tsx";
import { ok } from "../../lib/api.ts";
import { addDays, dateText, todayDay, weekdayOf } from "../../lib/format.ts";

/** The doctor's (admin: the whole clinic's) visits by day or week, with booking. */
export function CalendarPage({ me }: { me: Me }) {
  const [view, setView] = useState<"day" | "week">("week");
  const [anchor, setAnchor] = useState(todayDay());
  const [booking, setBooking] = useState(false);
  const [moving, setMoving] = useState<Appointment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Weeks start on Monday.
  const from = view === "day" ? anchor : addDays(anchor, -((weekdayOf(anchor) + 6) % 7));
  const to = view === "day" ? anchor : addDays(from, 6);
  const q = useListAppointments({ from, to }, { query: { queryKey: getListAppointmentsQueryKey({ from, to }) } });
  const patientsQ = useListPatients({ query: { queryKey: getListPatientsQueryKey() } });
  const waitQ = useListWaitlist({ query: { queryKey: getListWaitlistQueryKey() } });
  const visits = ok(q)?.appointments;
  const patients = ok(patientsQ)?.patients ?? [];
  const waiting = ok(waitQ)?.entries ?? [];
  const days = view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const step = view === "day" ? 1 : 7;

  return (
    <Shell me={me} title={me.role === "admin" ? "Clinic calendar" : "My calendar"} wide>
      {notice && <Notice>{notice}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <Button tone="plain" onClick={() => setAnchor(addDays(anchor, -step))} aria-label="Earlier">
          ←
        </Button>
        <Button tone="plain" onClick={() => setAnchor(todayDay())}>
          Today
        </Button>
        <Button tone="plain" onClick={() => setAnchor(addDays(anchor, step))} aria-label="Later">
          →
        </Button>
        <p className="font-semibold">{view === "day" ? dateText(anchor) : `${dateText(from)} – ${dateText(to)}`}</p>
        <span className="flex-1" />
        <Button tone={view === "day" ? "primary" : "plain"} onClick={() => setView("day")}>
          Day
        </Button>
        <Button tone={view === "week" ? "primary" : "plain"} onClick={() => setView("week")}>
          Week
        </Button>
        <Button tone="accent" onClick={() => (setMoving(null), setBooking(true))}>
          Book a visit
        </Button>
      </div>

      {(booking || moving) && (
        <Card title={moving ? `Move ${moving.patient.displayName}'s visit of ${dateText(moving.startsAt)}` : "Book a visit"}>
          <div className="mt-3">
            <BookingForm
              me={me}
              patients={patients}
              moving={moving ?? undefined}
              onDone={(m) => {
                setNotice(m);
                setBooking(false);
                setMoving(null);
              }}
            />
            <Button tone="quiet" className="mt-3" onClick={() => (setBooking(false), setMoving(null))}>
              Close
            </Button>
          </div>
        </Card>
      )}

      {!visits ? (
        <Loading />
      ) : (
        <div className={`grid gap-3 ${view === "week" ? "md:grid-cols-2 xl:grid-cols-4" : ""}`}>
          {days.map((d) => {
            const list = visits.filter((a) => dateText(a.startsAt) === dateText(d));
            return (
              <section key={d} className={`flex flex-col gap-2 rounded-3xl p-4 ${d === todayDay() ? "bg-brand-50" : "bg-white shadow-soft"}`}>
                <h2 className="font-semibold">
                  {dateText(d)}{" "}
                  <span className="text-sm font-normal text-ink-soft">
                    · {list.filter((a) => a.status !== "cancelled").length} visit{list.filter((a) => a.status !== "cancelled").length === 1 ? "" : "s"}
                  </span>
                </h2>
                {list.map((a) => (
                  <AppointmentCard key={a.id} a={a} me={me} showPatient onMove={(x) => (setBooking(false), setMoving(x))} />
                ))}
                {!list.length && <p className="text-sm text-ink-faint">No visits.</p>}
              </section>
            );
          })}
        </div>
      )}

      <Card title="Waiting list">
        {!waiting.length ? (
          <p className="mt-1 text-sm text-ink-soft">Nobody is waiting. When a visit is cancelled, the first matching patient here is offered it automatically.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {waiting.map((w) => (
              <WaitlistRow key={w.id} entry={w} showPatient />
            ))}
          </ul>
        )}
      </Card>
    </Shell>
  );
}
