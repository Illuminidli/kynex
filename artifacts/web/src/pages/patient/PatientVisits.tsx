import { getListAppointmentsQueryKey, getListWaitlistQueryKey, useListAppointments, useListWaitlist, type Appointment, type Me } from "@kynex/api-client-react";
import { useState } from "react";
import { AppointmentCard, BookingForm, OfferCard, WaitlistForm, WaitlistRow } from "../../components/Booking.tsx";
import { Card, Shell } from "../../components/Shell.tsx";
import { Button, Loading, Notice } from "../../components/ui.tsx";
import { ok } from "../../lib/api.ts";
import { addDays, dateText, todayDay } from "../../lib/format.ts";

/** The patient's visits: upcoming and past, booking, moving, cancelling and the waiting list. */
export function PatientVisits({ me }: { me: Me }) {
  const from = addDays(todayDay(), -30);
  const to = addDays(todayDay(), 60);
  const q = useListAppointments({ from, to }, { query: { queryKey: getListAppointmentsQueryKey({ from, to }) } });
  const waitQ = useListWaitlist({ query: { queryKey: getListWaitlistQueryKey() } });
  const visits = ok(q)?.appointments;
  const waiting = ok(waitQ)?.entries ?? [];
  const [mode, setMode] = useState<"list" | "book" | "wait">("list");
  const [moving, setMoving] = useState<Appointment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = Date.now();
  const upcoming = visits?.filter((a) => new Date(a.endsAt).getTime() > now && a.status !== "cancelled") ?? [];
  const past = visits?.filter((a) => !upcoming.includes(a)).reverse() ?? [];
  const done = (msg: string) => {
    setNotice(msg);
    setMode("list");
    setMoving(null);
  };

  if (mode !== "list") {
    return (
      <Shell me={me} title={moving ? `Move your visit of ${dateText(moving.startsAt)}` : mode === "book" ? "Book a visit" : "Join the waiting list"} back={{ href: "/visits", label: "Visits" }}>
        <Card>
          {mode === "book" ? <BookingForm me={me} moving={moving ?? undefined} onDone={done} /> : <WaitlistForm me={me} onDone={done} />}
        </Card>
        <Button tone="plain" onClick={() => (setMode("list"), setMoving(null))}>
          Back
        </Button>
      </Shell>
    );
  }

  return (
    <Shell me={me} title="My visits">
      {notice && <Notice>{notice}</Notice>}
      {waiting
        .filter((w) => w.status === "offered")
        .map((w) => (
          <OfferCard key={w.id} entry={w} />
        ))}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setMode("book")}>Book a visit</Button>
        <Button tone="plain" onClick={() => setMode("wait")}>
          Wait for an earlier slot
        </Button>
      </div>
      {!visits ? (
        <Loading />
      ) : (
        <>
          <Card title="Coming up">
            <div className="mt-2 flex flex-col gap-2">
              {!upcoming.length && <p className="text-sm text-ink-soft">No visits booked.</p>}
              {upcoming.map((a) => (
                <AppointmentCard key={a.id} a={a} me={me} onMove={(x) => (setMoving(x), setMode("book"))} />
              ))}
            </div>
          </Card>
          {waiting.some((w) => w.status === "waiting") && (
            <Card title="On the waiting list">
              <ul className="mt-1 divide-y divide-line">
                {waiting
                  .filter((w) => w.status === "waiting")
                  .map((w) => (
                    <WaitlistRow key={w.id} entry={w} />
                  ))}
              </ul>
            </Card>
          )}
          {past.length > 0 && (
            <Card title="Earlier and cancelled">
              <div className="mt-2 flex flex-col gap-2">
                {past.map((a) => (
                  <AppointmentCard key={a.id} a={a} me={me} />
                ))}
              </div>
            </Card>
          )}
          <p className="text-xs text-ink-faint">You can move or cancel a visit up to 12 hours before it. After that, please call the clinic.</p>
        </>
      )}
    </Shell>
  );
}
