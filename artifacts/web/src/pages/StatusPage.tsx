import { getGetHealthQueryKey, useGetHealth } from "@kynex/api-client-react";
import { EXERCISES } from "@kynex/motion";
import type { ReactNode } from "react";

/**
 * Status page (/status). Proves the pieces are connected end to end:
 * this screen -> API server -> database, plus the camera engine loaded in the browser.
 */
export function StatusPage() {
  const health = useGetHealth({ query: { queryKey: getGetHealthQueryKey(), refetchInterval: 10_000 } });
  // 200 = all fine, 503 = server up but database down; both carry the same status details.
  const data = health.data?.data;
  const facing = EXERCISES.filter((e) => e.view === "front").length;

  const serverOk = !!data;
  const dbOk = !!data?.database.ok;
  const accounts = data?.testAccounts ?? 0;
  const library = data?.exercises ?? 0;
  const libraryOk = library >= EXERCISES.length && EXERCISES.length > 0;
  const allOk = serverOk && dbOk && EXERCISES.length > 0 && accounts > 0 && libraryOk;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-5 py-10">
      <header className="flex items-center gap-3">
        <img src="/icon.svg" alt="" className="size-11 rounded-2xl shadow-soft" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kynex</h1>
          <p className="text-sm text-ink-soft">Platform check</p>
        </div>
      </header>

      <section className={`rounded-3xl p-6 shadow-soft ${allOk ? "bg-brand-700 text-white" : "bg-white"}`}>
        <p className={`text-sm font-medium ${allOk ? "text-white/70" : "text-ink-soft"}`}>Status</p>
        <p className="mt-1 text-2xl font-semibold">
          {health.isPending ? "Checking…" : allOk ? "Kynex is running" : "Something isn't connected"}
        </p>
        <p className={`mt-2 text-sm ${allOk ? "text-white/75" : "text-ink-soft"}`}>
          Open this same link on your phone and laptop: both read from the one shared database.
        </p>
      </section>

      <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-soft">
        <Check
          ok={serverOk}
          pending={health.isPending}
          title="Server"
          detail={data ? `Version ${data.version} · ${data.environment === "production" ? "production build" : "development"}` : "Not reachable"}
        />
        <Check
          ok={dbOk}
          pending={health.isPending}
          title="Database"
          detail={
            data?.database.ok
              ? `${data.database.kind === "postgres" ? "PostgreSQL" : "Local test database (laptop only)"} ${data.database.version ?? ""} · answered in ${data.database.latencyMs} ms`
              : !data
                ? "Not reachable"
                : data.database.kind === "local-file"
                  ? "No database connected: DATABASE_URL is not set on this server"
                  : "Database connected but not answering"
          }
        />
        <Check
          ok={accounts > 0}
          pending={health.isPending}
          title="Sign-in accounts"
          detail={
            accounts > 0
              ? `${accounts} test accounts ready`
              : "None yet: add a DEMO_PASSWORD secret (at least 10 characters) in Replit, then restart"
          }
        />
        <Check
          ok={libraryOk}
          pending={health.isPending}
          title="Exercise library"
          detail={
            libraryOk
              ? `${library} exercises in the database`
              : `${library} of ${EXERCISES.length} exercises in the database: the copy at start-up failed (see the server log, "Start-up step failed")`
          }
        />
        <Check
          ok={EXERCISES.length > 0}
          title="Camera engine"
          detail={`${EXERCISES.length} exercises loaded · ${facing} facing the camera, ${EXERCISES.length - facing} side-on`}
        />
      </ul>

      {data && (
        <p className="text-center text-xs text-ink-faint">
          Server time {new Date(data.serverTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" })} · checks every 10 seconds
        </p>
      )}

      <a href="/" className="rounded-2xl bg-brand-700 px-5 py-3 text-center font-medium text-white shadow-soft">
        Go to sign in
      </a>

      <section className="rounded-3xl border border-line bg-white/60 p-5 text-sm text-ink-soft">
        <p className="font-medium text-ink">Install on your phone</p>
        <p className="mt-1">
          Android (Chrome): menu ⋮ → <b>Add to home screen</b>. iPhone (Safari): Share → <b>Add to Home Screen</b>. It then opens like an app.
        </p>
      </section>
    </main>
  );
}

function Check({ ok, pending, title, detail }: { ok: boolean; pending?: boolean; title: string; detail: ReactNode }) {
  const tone = pending ? "bg-line text-ink-faint" : ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad";
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${tone}`} aria-hidden="true">
        {pending ? "…" : ok ? "✓" : "!"}
      </span>
      <div className="min-w-0">
        <p className="font-medium">
          {title} <span className="sr-only">{pending ? "checking" : ok ? "working" : "not working"}</span>
        </p>
        <p className="text-sm text-ink-soft">{detail}</p>
      </div>
    </li>
  );
}
