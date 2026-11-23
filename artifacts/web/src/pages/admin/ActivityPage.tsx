import { getListActivityQueryKey, getListPatientsQueryKey, useListActivity, useListPatients, type ListActivityParams, type Me } from "@kynex/api-client-react";
import { useState } from "react";
import { Shell } from "../../components/Shell.tsx";
import { Field, inputCls, Loading } from "../../components/ui.tsx";
import { failed, ok } from "../../lib/api.ts";
import { addDays, todayDay } from "../../lib/format.ts";
import { ActivityList } from "../care/PatientPage.tsx";

const AREAS = [
  ["", "Everything"],
  ["session", "Sessions"],
  ["symptom", "Symptoms"],
  ["plan", "Plan changes"],
  ["review", "Doctor reviews"],
  ["booking", "Bookings"],
  ["note", "Notes"],
] as const;

/** Every patient interaction, newest first, with filters (the audit trail). */
export function ActivityPage({ me }: { me: Me }) {
  const [patientId, setPatientId] = useState("");
  const [area, setArea] = useState("");
  const [from, setFrom] = useState(addDays(todayDay(), -30));
  const [to, setTo] = useState(todayDay());
  const params: ListActivityParams = { ...(patientId ? { patientId } : {}), ...(area ? { area: area as ListActivityParams["area"] } : {}), from, to };
  const q = useListActivity(params, { query: { queryKey: getListActivityQueryKey(params) } });
  const patientsQ = useListPatients({ query: { queryKey: getListPatientsQueryKey() } });
  const patients = ok(patientsQ)?.patients ?? [];
  const items = ok(q)?.items;
  return (
    <Shell me={me} title="Activity" wide>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Patient">
          <select className={inputCls} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">All patients</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What">
          <select className={inputCls} value={area} onChange={(e) => setArea(e.target.value)}>
            {AREAS.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {!items ? failed(q) ? <p className="text-bad">{failed(q)}</p> : <Loading /> : <ActivityList items={items} />}
      <p className="text-xs text-ink-faint">Every change is recorded with who made it and when. Entries can't be edited or deleted (except by resetting a test account).</p>
    </Shell>
  );
}
