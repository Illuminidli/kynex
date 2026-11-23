import { getListMySessionsQueryKey, useListMySessions, type Me } from "@kynex/api-client-react";
import { Link } from "wouter";
import { LangSwitch } from "../../components/LangSwitch.tsx";
import { Card, Shell } from "../../components/Shell.tsx";
import { Badge, Loading, Notice } from "../../components/ui.tsx";
import { failed, ok } from "../../lib/api.ts";
import { dateTimeText } from "../../lib/format.ts";
import { useLang } from "../../lib/lang.ts";

/** Every session the patient has done, newest first. */
export function MyReports({ me }: { me: Me }) {
  const [lang] = useLang();
  const en = lang === "en";
  const q = useListMySessions({ query: { queryKey: getListMySessionsQueryKey() } });
  const list = ok(q)?.sessions;
  return (
    <Shell me={me} title={en ? "My reports" : "मेरी रिपोर्ट"} aside={<LangSwitch />}>
      {!list ? (
        failed(q) ? <p className="text-bad">{failed(q)}</p> : <Loading />
      ) : !list.length ? (
        <Notice>{en ? "No sessions yet. Your report appears here after each session." : "अभी कोई सेशन नहीं। हर सेशन के बाद रिपोर्ट यहाँ दिखेगी।"}</Notice>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.id}>
                <Link href={`/reports/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span>
                    <span className="font-medium">{dateTimeText(s.startedAt, lang)}</span>
                    <span className="block text-sm text-ink-soft">
                      {s.status === "red-flag"
                        ? en
                          ? "Stopped at the check-in"
                          : "जाँच पर रोका गया"
                        : `${s.exercises} ${en ? "exercises" : "व्यायाम"} · ${s.repsFull} ${en ? "full reps" : "पूरे रेप"} · ${en ? "pain" : "दर्द"} ${s.painBefore ?? "–"} → ${s.painAfter ?? "–"}`}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    {s.problems > 0 && <Badge tone="warn">⚠ {s.problems}</Badge>}
                    {s.reviewed && <Badge tone="good">{en ? "Doctor reviewed" : "डॉक्टर ने देखा"}</Badge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Shell>
  );
}
