import {
  addTimeOff,
  deleteTimeOff,
  getGetAvailabilityQueryKey,
  getListCliniciansQueryKey,
  getListTimeOffQueryKey,
  setAvailability,
  useGetAvailability,
  useListClinicians,
  useListTimeOff,
  type Me,
  type WeeklyHours,
} from "@kynex/api-client-react";
import { useEffect, useState } from "react";
import { Card, Shell } from "../../components/Shell.tsx";
import { Button, ErrorText, Field, inputCls, Loading, Notice } from "../../components/ui.tsx";
import { must, ok, useAction } from "../../lib/api.ts";
import { dateText, minutesText, todayDay, WEEKDAYS } from "../../lib/format.ts";

type Block = WeeklyHours["hours"][number];
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Working hours (with breaks) and leave days. The admin also adds clinic holidays. */
export function HoursPage({ me }: { me: Me }) {
  const docsQ = useListClinicians({ query: { queryKey: getListCliniciansQueryKey() } });
  const doctors = ok(docsQ)?.clinicians ?? [];
  const [doctorId, setDoctorId] = useState(me.role === "clinician" ? me.id : "");
  const chosen = doctorId || doctors[0]?.id || "";
  const params = me.role === "admin" ? { clinicianId: chosen } : {};
  const hoursQ = useGetAvailability(params, { query: { queryKey: getGetAvailabilityQueryKey(params), enabled: !!chosen } });
  const hours = ok(hoursQ);
  const offQ = useListTimeOff({ query: { queryKey: getListTimeOffQueryKey() } });
  const timeOff = ok(offQ)?.timeOff ?? [];

  return (
    <Shell me={me} title="Working hours and leave" wide>
      {me.role === "admin" && (
        <Field label="Doctor">
          <select className={`${inputCls} w-64`} value={chosen} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.displayName}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Weekly hours">{hours ? <HoursEditor key={hours.clinicianId} value={hours} /> : <Loading />}</Card>
        <Card title="Leave and clinic holidays">
          <TimeOffEditor me={me} doctorId={chosen} list={timeOff} />
        </Card>
      </div>
      <p className="text-xs text-ink-faint">
        Visits can be booked in these hours only, with 10 minutes kept free between visits, up to 60 days ahead. Changing hours or adding leave doesn't cancel visits already booked: move them from the calendar.
      </p>
    </Shell>
  );
}

function HoursEditor({ value }: { value: WeeklyHours }) {
  const [blocks, setBlocks] = useState<Block[]>(value.hours);
  const [saved, setSaved] = useState(false);
  const act = useAction();
  useEffect(() => setBlocks(value.hours), [value]);
  const update = (i: number, b: Partial<Block>) => (setSaved(false), setBlocks((x) => x.map((y, n) => (n === i ? { ...y, ...b } : y))));
  return (
    <div className="mt-2 flex flex-col gap-3">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
        <div key={d} className="flex flex-wrap items-center gap-2">
          <span className="w-10 font-medium">{WEEKDAYS.en[d]}</span>
          {blocks.map((b, i) =>
            b.weekday !== d ? null : (
              <span key={i} className="flex items-center gap-1 rounded-xl bg-canvas px-2 py-1 text-sm">
                <input type="time" step={900} className="rounded border border-line px-1" value={minutesText(b.startMinute)} onChange={(e) => update(i, { startMinute: toMin(e.target.value) })} aria-label={`${WEEKDAYS.en[d]} start`} />
                –
                <input type="time" step={900} className="rounded border border-line px-1" value={minutesText(b.endMinute)} onChange={(e) => update(i, { endMinute: toMin(e.target.value) })} aria-label={`${WEEKDAYS.en[d]} end`} />
                <button type="button" className="px-1 text-bad" aria-label="Remove these hours" onClick={() => (setSaved(false), setBlocks((x) => x.filter((_, n) => n !== i)))}>
                  ✕
                </button>
              </span>
            ),
          )}
          {!blocks.some((b) => b.weekday === d) && <span className="text-sm text-ink-faint">Not working</span>}
          <button type="button" className="text-sm text-brand-700 underline" onClick={() => (setSaved(false), setBlocks((x) => [...x, { weekday: d, startMinute: 9 * 60, endMinute: 13 * 60 }]))}>
            + hours
          </button>
        </div>
      ))}
      <ErrorText>{act.error}</ErrorText>
      {saved && <Notice>Saved. Free times now follow these hours.</Notice>}
      <Button className="self-start" disabled={act.busy} onClick={async () => (await act.run(() => must(setAvailability({ clinicianId: value.clinicianId, hours: blocks })))) && setSaved(true)}>
        Save hours
      </Button>
      <p className="text-xs text-ink-faint">Two blocks on one day leave a break between them (e.g. lunch).</p>
    </div>
  );
}

function TimeOffEditor({ me, doctorId, list }: { me: Me; doctorId: string; list: { id: string; clinicianId: string | null; clinicianName: string | null; startDate: string; endDate: string; reason: string }[] }) {
  const [start, setStart] = useState(todayDay());
  const [end, setEnd] = useState(todayDay());
  const [reason, setReason] = useState("");
  const [whole, setWhole] = useState(false);
  const act = useAction();
  return (
    <div className="mt-2 flex flex-col gap-3">
      <ul className="divide-y divide-line">
        {!list.length && <li className="py-2 text-sm text-ink-soft">None coming up.</li>}
        {list.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              <b>{t.clinicianName ?? "Whole clinic closed"}</b>: {dateText(t.startDate)}
              {t.endDate !== t.startDate ? ` – ${dateText(t.endDate)}` : ""}
              {t.reason ? ` (${t.reason})` : ""}
            </span>
            {(me.role === "admin" || t.clinicianId === me.id) && (
              <Button tone="quiet" disabled={act.busy} onClick={() => act.run(() => must(deleteTimeOff(t.id)))}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Field label="First day">
          <input type="date" className={inputCls} value={start} min={todayDay()} onChange={(e) => (setStart(e.target.value), e.target.value > end && setEnd(e.target.value))} />
        </Field>
        <Field label="Last day">
          <input type="date" className={inputCls} value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label="Reason (optional)">
        <input className={inputCls} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Diwali, conference" />
      </Field>
      {me.role === "admin" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> Whole clinic closed (holiday)
        </label>
      )}
      <ErrorText>{act.error}</ErrorText>
      <Button
        className="self-start"
        disabled={act.busy}
        onClick={async () => {
          if (await act.run(() => must(addTimeOff({ clinicianId: whole ? null : doctorId || null, startDate: start, endDate: end, reason })))) setReason("");
        }}
      >
        {whole ? "Add clinic holiday" : "Add leave"}
      </Button>
    </div>
  );
}
