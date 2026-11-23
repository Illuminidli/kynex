import { getGetSessionQueryKey, reviewSession, useGetSession, type Me } from "@kynex/api-client-react";
import { useState } from "react";
import { LangSwitch } from "../../components/LangSwitch.tsx";
import { SessionReportView } from "../../components/SessionReport.tsx";
import { Card, Shell } from "../../components/Shell.tsx";
import { Button, ErrorText, inputCls, Loading } from "../../components/ui.tsx";
import { failed, must, ok, useAction } from "../../lib/api.ts";
import { useLang } from "../../lib/lang.ts";

/** One session: the patient's report, or the doctor's detailed analysis with the review. */
export function SessionPage({ me, sessionId }: { me: Me; sessionId: string }) {
  const q = useGetSession(sessionId, { query: { queryKey: getGetSessionQueryKey(sessionId) } });
  const report = ok(q);
  const [lang] = useLang();
  const staff = me.role !== "patient";
  const back = staff ? { href: report ? `/patients/${report.patient.id}` : "/", label: report?.patient.displayName ?? "Back" } : { href: "/reports", label: lang === "en" ? "My reports" : "मेरी रिपोर्ट" };
  return (
    <Shell
      me={me}
      title={staff ? `Session analysis${report ? `: ${report.patient.displayName}` : ""}` : lang === "en" ? "Session report" : "सेशन रिपोर्ट"}
      back={back}
      wide={staff}
      aside={staff ? undefined : <LangSwitch />}
    >
      {!report ? (
        failed(q) ? <p className="text-bad">{failed(q)}</p> : <Loading />
      ) : (
        <>
          {staff && <ReviewBox sessionId={sessionId} reviewed={!!report.review} note={report.review?.note ?? ""} status={report.status} />}
          <SessionReportView report={report} lang={staff ? "en" : lang} viewer={staff ? "doctor" : "patient"} />
        </>
      )}
    </Shell>
  );
}

function ReviewBox({ sessionId, reviewed, note: initial, status }: { sessionId: string; reviewed: boolean; note: string; status: string }) {
  const act = useAction();
  const [note, setNote] = useState(initial);
  if (status === "in-progress") return null;
  return (
    <Card title={reviewed ? "Reviewed" : "Review this session"}>
      <div className="mt-2 flex flex-col gap-2">
        <textarea
          className={inputCls}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          placeholder="Optional note for the patient (they see it on their report)"
        />
        <ErrorText>{act.error}</ErrorText>
        <Button className="self-start" disabled={act.busy} onClick={() => act.run(() => must(reviewSession(sessionId, { note })))}>
          {reviewed ? "Update the review" : "Mark as reviewed"}
        </Button>
      </div>
    </Card>
  );
}
