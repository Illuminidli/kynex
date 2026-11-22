import { getListExercisesQueryKey, savePlan, useListExercises, type ExerciseSummary, type Plan, type PlanItemInput } from "@kynex/api-client-react";
import { useMemo, useState } from "react";
import { must, ok, useAction } from "../lib/api.ts";
import { todayDay, WEEKDAYS } from "../lib/format.ts";
import { regionLabel } from "../lib/labels.ts";
import { Badge, Button, ErrorText, Field, inputCls } from "./ui.tsx";

type Row = PlanItemInput & { exercise: ExerciseSummary };

const fromPlan = (plan: Plan | null): Row[] =>
  plan?.items.map((i) => ({
    exercise: i.exercise,
    exerciseSlug: i.exercise.slug,
    sets: i.sets,
    reps: i.reps,
    holdSeconds: i.holdSeconds,
    restSeconds: i.restSeconds,
    weekdays: i.weekdays,
    timesPerDay: i.timesPerDay,
    side: i.side,
    note: i.note,
  })) ?? [];

/** Build or change a patient's plan: exercises from the library, each with its dose and days. */
export function PlanEditor({ patientId, plan, onSaved, onCancel }: { patientId: string; plan: Plan | null; onSaved: () => void; onCancel: () => void }) {
  const libraryQ = useListExercises({ query: { queryKey: getListExercisesQueryKey() } });
  const library = ok(libraryQ)?.exercises ?? [];
  const [rows, setRows] = useState<Row[]>(fromPlan(plan));
  const [startDate, setStart] = useState(plan?.startDate ?? todayDay());
  const [endDate, setEnd] = useState(plan?.endDate ?? "");
  const [note, setNote] = useState(plan?.note ?? "");
  const [search, setSearch] = useState("");
  const act = useAction();

  const choices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return library.filter((e) => !e.hidden && !rows.some((r) => r.exerciseSlug === e.slug) && (!q || e.name.en.toLowerCase().includes(q) || e.region.includes(q)));
  }, [library, rows, search]);

  const add = (e: ExerciseSummary) =>
    setRows((r) => [
      ...r,
      {
        exercise: e,
        exerciseSlug: e.slug,
        sets: 2,
        reps: e.kind === "reps" ? 10 : null,
        holdSeconds: e.kind === "reps" ? null : 20,
        restSeconds: 45,
        weekdays: [1, 2, 3, 4, 5, 6],
        timesPerDay: 1,
        side: "both",
        note: "",
      },
    ]);
  const update = (i: number, change: Partial<Row>) => setRows((r) => r.map((row, n) => (n === i ? { ...row, ...change } : row)));
  const move = (i: number, by: number) =>
    setRows((r) => {
      const out = [...r];
      const [x] = out.splice(i, 1);
      out.splice(Math.max(0, Math.min(out.length, i + by)), 0, x!);
      return out;
    });

  async function save() {
    const res = await act.run(() =>
      must(
        savePlan(patientId, {
          startDate,
          endDate: endDate || null,
          note,
          items: rows.map(({ exercise: _e, ...r }) => r),
        }),
      ),
    );
    if (res) onSaved();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts">
          <input type="date" className={inputCls} value={startDate} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Ends (optional)">
          <input type="date" className={inputCls} value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label="Note for the patient (shown on their home page)">
        <textarea className={inputCls} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <ol className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={r.exerciseSlug} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                {i + 1}. {r.exercise.name.en}{" "}
                <span className="text-sm font-normal text-ink-soft">({regionLabel(r.exercise.region, "en")})</span>
              </p>
              <div className="flex gap-1">
                <Button tone="plain" className="px-2 py-1" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </Button>
                <Button tone="plain" className="px-2 py-1" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </Button>
                <Button tone="danger" className="px-2 py-1" onClick={() => setRows((x) => x.filter((_, n) => n !== i))}>
                  Remove
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Sets">
                <input type="number" min={1} max={10} className={inputCls} value={r.sets} onChange={(e) => update(i, { sets: Number(e.target.value) })} />
              </Field>
              {r.exercise.kind === "reps" ? (
                <Field label="Reps per set">
                  <input type="number" min={1} max={50} className={inputCls} value={r.reps ?? ""} onChange={(e) => update(i, { reps: Number(e.target.value) })} />
                </Field>
              ) : (
                <Field label="Hold (seconds)">
                  <input type="number" min={5} max={300} className={inputCls} value={r.holdSeconds ?? ""} onChange={(e) => update(i, { holdSeconds: Number(e.target.value) })} />
                </Field>
              )}
              <Field label="Rest between sets (s)">
                <input type="number" min={0} max={300} step={5} className={inputCls} value={r.restSeconds} onChange={(e) => update(i, { restSeconds: Number(e.target.value) })} />
              </Field>
              <Field label="Times a day">
                <select className={inputCls} value={r.timesPerDay} onChange={(e) => update(i, { timesPerDay: Number(e.target.value) })}>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}×
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Days">
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={r.weekdays.includes(d)}
                    onClick={() => update(i, { weekdays: r.weekdays.includes(d) ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d] })}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${r.weekdays.includes(d) ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white"}`}
                  >
                    {WEEKDAYS.en[d]}
                  </button>
                ))}
              </div>
            </Field>
            {r.exercise.laterality === "unilateral" && (
              <Field label="Side">
                <select className={inputCls} value={r.side} onChange={(e) => update(i, { side: e.target.value as Row["side"] })}>
                  <option value="both">Both sides (left, then right)</option>
                  <option value="left">Left only</option>
                  <option value="right">Right only</option>
                </select>
              </Field>
            )}
            <Field label="Note for this exercise (optional)">
              <input className={inputCls} maxLength={300} value={r.note} onChange={(e) => update(i, { note: e.target.value })} placeholder="e.g. Stop if your back hurts" />
            </Field>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2 rounded-2xl bg-canvas p-4">
        <p className="font-semibold">Add an exercise</p>
        <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or body area" aria-label="Search exercises" />
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {choices.map((e) => (
            <button key={e.slug} type="button" onClick={() => add(e)} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm hover:ring-2 hover:ring-brand-200">
              <span>
                <b>{e.name.en}</b> <span className="text-ink-soft">· {regionLabel(e.region, "en")}</span>
              </span>
              {e.kind !== "reps" && <Badge tone="plain">Hold</Badge>}
            </button>
          ))}
          {!choices.length && <p className="text-sm text-ink-faint">No more exercises match.</p>}
        </div>
      </div>

      <ErrorText>{act.error}</ErrorText>
      <div className="flex gap-2">
        <Button disabled={act.busy || !rows.length || rows.some((r) => !r.weekdays.length)} onClick={save}>
          Save plan
        </Button>
        <Button tone="plain" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {rows.some((r) => !r.weekdays.length) && <p className="text-xs text-bad">Every exercise needs at least one day.</p>}
    </div>
  );
}

/** The plan as the doctor (or patient) reads it. */
export function PlanView({ plan, lang = "en" }: { plan: Plan; lang?: "en" | "hi" }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        From {plan.startDate}
        {plan.endDate ? ` to ${plan.endDate}` : ""}
        {plan.updatedByName ? ` · last changed by ${plan.updatedByName}` : ""}
      </p>
      {plan.note && <p className="rounded-xl bg-brand-50 p-3 text-sm">{plan.note}</p>}
      <ol className="flex flex-col divide-y divide-line">
        {plan.items.map((i, n) => (
          <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <span className="font-medium">
              {n + 1}. {i.exercise.name[lang]}
              {i.side !== "both" && <span className="text-ink-soft"> ({i.side} side)</span>}
            </span>
            <span className="text-sm text-ink-soft">
              {i.sets} × {i.reps ? `${i.reps} reps` : `${i.holdSeconds} s hold`} · rest {i.restSeconds} s · {weekdaysLabel(i.weekdays)}
              {i.timesPerDay > 1 ? ` · ${i.timesPerDay}× a day` : ""}
            </span>
            {i.note && <span className="w-full text-sm text-ink-faint">{i.note}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function weekdaysLabel(days: number[]) {
  const s = [...days].sort();
  if (s.length === 7) return "every day";
  if (s.join() === "1,2,3,4,5,6") return "Mon–Sat";
  return s.map((d) => WEEKDAYS.en[d]).join(", ");
}
