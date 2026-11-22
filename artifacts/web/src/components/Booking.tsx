import {
  acceptOffer,
  bookAppointment,
  declineOffer,
  getGetSlotsQueryKey,
  getListVisitTypesQueryKey,
  joinWaitlist,
  leaveWaitlist,
  moveAppointment,
  setAppointmentStatus,
  useGetSlots,
  useListVisitTypes,
  type Appointment,
  type BookResult,
  type Me,
  type VisitType,
  type WaitlistEntry,
} from "@kynex/api-client-react";
import { useState } from "react";
import { must, ok, useAction } from "../lib/api.ts";
import { addDays, dateText, dateTimeText, dayOf, timeText, todayDay, weekdayOf, WEEKDAYS } from "../lib/format.ts";
import { Badge, Button, ErrorText, Field, inputCls, Notice } from "./ui.tsx";

const MODE: Record<string, string> = { clinic: "At the clinic", video: "Video call", home: "Home visit" };
const STATUS: Record<Appointment["status"], { text: string; tone: "brand" | "good" | "bad" | "warn" | "plain" }> = {
  booked: { text: "Waiting for the clinic to confirm", tone: "warn" },
  confirmed: { text: "Confirmed", tone: "good" },
  arrived: { text: "Arrived", tone: "brand" },
  completed: { text: "Completed", tone: "plain" },
  "no-show": { text: "No-show", tone: "bad" },
  cancelled: { text: "Cancelled", tone: "plain" },
};

export const statusBadge = (s: Appointment["status"]) => <Badge tone={STATUS[s].tone}>{STATUS[s].text}</Badge>;

/** One visit, with the actions this person may take. */
export function AppointmentCard({ a, me, showPatient = false, onMove }: { a: Appointment; me: Me; showPatient?: boolean; onMove?: (a: Appointment) => void }) {
  const act = useAction();
  const staff = me.role !== "patient";
  const set = (status: "confirmed" | "arrived" | "completed" | "no-show" | "cancelled") => {
    let reason: string | undefined;
    if (status === "cancelled") {
      const r = window.prompt(staff ? "Reason for cancelling (the patient sees this):" : "Cancel this visit? You can add a reason (optional):", "");
      if (r === null) return;
      reason = r.trim() || undefined;
    }
    return act.run(() => must(setAppointmentStatus(a.id, { status, ...(reason ? { reason } : {}) })));
  };
  const live = a.status === "booked" || a.status === "confirmed" || a.status === "arrived";
  // Arrived / completed / no-show can be marked from the day of the visit on.
  const onTheDay = dayOf(new Date(a.startsAt)) <= todayDay();
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border border-line bg-white p-4 ${a.status === "cancelled" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {dateText(a.startsAt)} · {timeText(a.startsAt)}–{timeText(a.endsAt)}
          </p>
          <p className="text-sm text-ink-soft">
            {a.visitType.name} · {MODE[a.visitType.mode]} · {showPatient ? a.patient.displayName : a.clinician.displayName}
          </p>
        </div>
        {statusBadge(a.status)}
      </div>
      {a.note && <p className="text-sm text-ink-soft">Note: {a.note}</p>}
      {a.meetingLink && live && (
        <a href={a.meetingLink} target="_blank" rel="noreferrer noopener" className="text-sm font-medium text-brand-700 underline">
          Open the video call link
        </a>
      )}
      {a.cancelReason && a.status === "cancelled" && <p className="text-sm text-ink-soft">Reason: {a.cancelReason}</p>}
      {a.seriesId && <p className="text-xs text-ink-faint">Part of a repeating series</p>}
      <ErrorText>{act.error}</ErrorText>
      {live && (
        <div className="flex flex-wrap gap-2">
          {staff && a.status === "booked" && (
            <Button disabled={act.busy} onClick={() => set("confirmed")}>
              Confirm
            </Button>
          )}
          {staff && onTheDay && a.status !== "arrived" && (
            <Button tone="plain" disabled={act.busy} onClick={() => set("arrived")}>
              Arrived
            </Button>
          )}
          {staff && onTheDay && (
            <Button tone="plain" disabled={act.busy} onClick={() => set("completed")}>
              Completed
            </Button>
          )}
          {staff && onTheDay && a.status !== "arrived" && (
            <Button tone="plain" disabled={act.busy} onClick={() => set("no-show")}>
              No-show
            </Button>
          )}
          {a.canChange && onMove && (
            <Button tone="plain" disabled={act.busy} onClick={() => onMove(a)}>
              Move
            </Button>
          )}
          {a.canChange && (
            <Button tone="danger" disabled={act.busy} onClick={() => set("cancelled")}>
              Cancel
            </Button>
          )}
          {!staff && !a.canChange && a.status !== "arrived" && <p className="text-xs text-ink-faint">Within 12 hours of the visit: please call the clinic to change it.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Book a visit (or move one). Patients book for themselves; the doctor and admin choose the
 * patient and can book a repeating series, previewing clashes first.
 */
export function BookingForm({
  me,
  patients,
  patientId: fixedPatient,
  moving,
  onDone,
}: {
  me: Me;
  patients?: { id: string; displayName: string }[];
  patientId?: string;
  moving?: Appointment;
  onDone: (message: string) => void;
}) {
  const staff = me.role !== "patient";
  const typesQ = useListVisitTypes({ query: { queryKey: getListVisitTypesQueryKey() } });
  const types = ok(typesQ)?.visitTypes ?? [];
  const [typeId, setTypeId] = useState<string>(moving?.visitType.id ?? "");
  const [patientId, setPatientId] = useState(fixedPatient ?? moving?.patient.id ?? "");
  const [day, setDay] = useState(addDays(todayDay(), 1));
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(4);
  const [preview, setPreview] = useState<BookResult | null>(null);
  const act = useAction();

  const type: VisitType | undefined = types.find((t) => t.id === (typeId || types[0]?.id));
  const needPatient = staff && !patientId;
  const params = {
    visitTypeId: type?.id ?? "",
    date: day,
    ...(staff && patientId ? { patientId } : {}),
    ...(moving ? { ignoreAppointmentId: moving.id } : {}),
  };
  const slotsQ = useGetSlots(params, { query: { queryKey: getGetSlotsQueryKey(params), enabled: !!type && !needPatient } });
  const slots = ok(slotsQ);

  const days = Array.from({ length: 14 }, (_, i) => addDays(todayDay(), i));
  const body = () => ({
    visitTypeId: type!.id,
    startsAt: slot!,
    ...(staff ? { patientId } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
    ...(type?.mode === "video" && link.trim() ? { meetingLink: link.trim() } : {}),
    ...(repeat && weekdays.length ? { repeat: { weekdays, weeks } } : {}),
  });

  async function submit() {
    if (!type || !slot) return;
    if (moving) {
      const done = await act.run(() => must(moveAppointment(moving.id, { startsAt: slot })));
      if (done) onDone(`Moved to ${dateTimeText(slot)}.`);
      return;
    }
    const res = await act.run(() => must(bookAppointment(body())));
    if (res) {
      const skipped = res.planned.filter((p) => !p.ok).length;
      onDone(
        res.booked.length > 1
          ? `Booked ${res.booked.length} visits${skipped ? `; ${skipped} date${skipped > 1 ? "s were" : " was"} skipped because of clashes` : ""}.`
          : `Booked: ${type.name}, ${dateTimeText(slot)}.${staff ? "" : " The clinic will confirm it."}`,
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {staff && !fixedPatient && !moving && (
        <Field label="Patient">
          <select className={inputCls} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">Choose…</option>
            {patients?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!moving && (
        <Field label="Type of visit">
          <div className="grid gap-2 sm:grid-cols-2">
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={type?.id === t.id}
                onClick={() => {
                  setTypeId(t.id);
                  setSlot(null);
                  setPreview(null);
                }}
                className={`rounded-xl border p-3 text-left ${type?.id === t.id ? "border-brand-700 bg-brand-50" : "border-line bg-white"}`}
              >
                <span className="block font-semibold">{t.name}</span>
                <span className="text-sm text-ink-soft">
                  {t.minutes} min · {MODE[t.mode]}
                </span>
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Day">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={day === d}
              onClick={() => {
                setDay(d);
                setSlot(null);
                setPreview(null);
              }}
              className={`flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 text-sm ${day === d ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white"}`}
            >
              <span className="text-xs">{WEEKDAYS.en[weekdayOf(d)]}</span>
              <span className="text-lg font-semibold">{Number(d.slice(8))}</span>
            </button>
          ))}
        </div>
        <input type="date" className={`${inputCls} mt-1 w-48`} value={day} min={todayDay()} max={addDays(todayDay(), 60)} onChange={(e) => e.target.value && (setDay(e.target.value), setSlot(null))} aria-label="Or pick a date" />
      </Field>

      <Field label="Time">
        {needPatient ? (
          <p className="text-sm text-ink-faint">Choose the patient first.</p>
        ) : slotsQ.isPending ? (
          <p className="text-sm text-ink-faint">Finding free times…</p>
        ) : slots?.closed && !slots.slots.length ? (
          <p className="text-sm text-ink-soft">{slots.closed}</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {slots?.slots.map((s) => (
              <button
                key={s.startsAt}
                type="button"
                aria-pressed={slot === s.startsAt}
                onClick={() => {
                  setSlot(s.startsAt);
                  setPreview(null);
                }}
                className={`rounded-lg border py-2 text-sm font-medium ${slot === s.startsAt ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white"}`}
              >
                {timeText(s.startsAt)}
              </button>
            ))}
          </div>
        )}
      </Field>

      {!moving && (
        <>
          {type?.mode === "video" && (
            <Field label="Video call link (optional)" hint="Made in Google Meet, Zoom or similar; starts with https://">
              <input className={inputCls} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/…" />
            </Field>
          )}
          <Field label={type?.mode === "home" ? "Address and note" : "Note (optional)"}>
            <input className={inputCls} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {staff && (
            <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={repeat} onChange={(e) => (setRepeat(e.target.checked), setPreview(null))} />
                Repeat this visit
              </label>
              {repeat && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6].map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={weekdays.includes(d)}
                        onClick={() => (setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d])), setPreview(null))}
                        className={`rounded-lg border px-3 py-1.5 text-sm ${weekdays.includes(d) ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white"}`}
                      >
                        {WEEKDAYS.en[d]}
                      </button>
                    ))}
                  </div>
                  <Field label="For how many weeks">
                    <select className={`${inputCls} w-32`} value={weeks} onChange={(e) => (setWeeks(Number(e.target.value)), setPreview(null))}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n} week{n > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button tone="plain" disabled={!slot || !weekdays.length || act.busy} onClick={async () => setPreview((await act.run(() => must(bookAppointment({ ...body(), preview: true })))) ?? null)}>
                    Check the dates
                  </Button>
                  {preview && (
                    <ul className="flex flex-col gap-1 text-sm">
                      {preview.planned.map((p) => (
                        <li key={p.startsAt} className={p.ok ? "" : "text-bad"}>
                          {p.ok ? "✓" : "✕"} {dateTimeText(p.startsAt)}
                          {p.reason ? ` — ${p.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
      <ErrorText>{act.error}</ErrorText>
      <Button disabled={!slot || act.busy || (repeat && !preview)} onClick={submit}>
        {moving ? "Move the visit" : repeat && preview ? `Book ${preview.planned.filter((p) => p.ok).length} visits` : "Book"}
      </Button>
      {repeat && !preview && <p className="text-xs text-ink-faint">Check the dates first: clashes are skipped, never double-booked.</p>}
    </div>
  );
}

/** Join the waiting list for an earlier or a free slot. */
export function WaitlistForm({ me, patientId, onDone }: { me: Me; patientId?: string; onDone: (msg: string) => void }) {
  const typesQ = useListVisitTypes({ query: { queryKey: getListVisitTypesQueryKey() } });
  const types = ok(typesQ)?.visitTypes ?? [];
  const [typeId, setTypeId] = useState("");
  const [from, setFrom] = useState(todayDay());
  const [to, setTo] = useState(addDays(todayDay(), 14));
  const [when, setWhen] = useState<"any" | "morning" | "afternoon">("any");
  const act = useAction();
  const vt = typeId || types[1]?.id || types[0]?.id;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">If a visit is cancelled in these dates, you're offered the slot in the app first. You have up to 12 hours to take it.</p>
      <Field label="Type of visit">
        <select className={inputCls} value={vt} onChange={(e) => setTypeId(e.target.value)}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.minutes} min)
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="From">
          <input type="date" className={inputCls} value={from} min={todayDay()} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={inputCls} value={to} min={from} max={addDays(todayDay(), 60)} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <Field label="Time of day">
        <select className={inputCls} value={when} onChange={(e) => setWhen(e.target.value as typeof when)}>
          <option value="any">Any time</option>
          <option value="morning">Morning (before 1 pm)</option>
          <option value="afternoon">Afternoon</option>
        </select>
      </Field>
      <ErrorText>{act.error}</ErrorText>
      <Button
        disabled={act.busy || !vt}
        onClick={async () => {
          const r = await act.run(() => must(joinWaitlist({ visitTypeId: vt!, fromDate: from, toDate: to, timeOfDay: when, ...(me.role !== "patient" && patientId ? { patientId } : {}) })));
          if (r) onDone("Added to the waiting list.");
        }}
      >
        Join the waiting list
      </Button>
    </div>
  );
}

/** A slot offered from the waiting list. */
export function OfferCard({ entry }: { entry: WaitlistEntry }) {
  const act = useAction();
  const [done, setDone] = useState<string | null>(null);
  if (done) return <Notice>{done}</Notice>;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-accent-500 bg-accent-50 p-4">
      <p className="font-semibold">A slot opened up for you</p>
      <p className="text-sm">
        {entry.visitType.name} on {dateTimeText(entry.offerStartsAt!)}. Held for you until {dateTimeText(entry.offerExpiresAt!)}.
      </p>
      <ErrorText>{act.error}</ErrorText>
      <div className="flex gap-2">
        <Button tone="accent" disabled={act.busy} onClick={async () => (await act.run(() => must(acceptOffer(entry.id)))) && setDone("Booked. See it under Visits.")}>
          Take it
        </Button>
        <Button tone="plain" disabled={act.busy} onClick={async () => (await act.run(() => must(declineOffer(entry.id)))) && setDone("No problem: you're still on the waiting list.")}>
          No thanks
        </Button>
      </div>
    </div>
  );
}

/** A waiting-list entry with a remove button. */
export function WaitlistRow({ entry, showPatient }: { entry: WaitlistEntry; showPatient?: boolean }) {
  const act = useAction();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span>
        {showPatient && <b>{entry.patient.displayName}: </b>}
        {entry.visitType.name}, {dateText(entry.fromDate)} – {dateText(entry.toDate)} ({entry.timeOfDay === "any" ? "any time" : entry.timeOfDay})
        {entry.status === "offered" && entry.offerStartsAt && <Badge tone="warn">Offered {dateTimeText(entry.offerStartsAt)}</Badge>}
      </span>
      <Button tone="quiet" disabled={act.busy} onClick={() => act.run(() => must(leaveWaitlist(entry.id)))}>
        Remove
      </Button>
    </li>
  );
}
