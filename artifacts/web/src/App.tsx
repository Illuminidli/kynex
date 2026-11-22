import { getGetMeQueryKey, useGetMe, type Me } from "@kynex/api-client-react";
import { Route, Switch } from "wouter";
import { ActivityPage } from "./pages/admin/ActivityPage.tsx";
import { AdminOverview } from "./pages/admin/AdminOverview.tsx";
import { AdminHome } from "./pages/AdminHome.tsx";
import { CalendarPage } from "./pages/care/CalendarPage.tsx";
import { DoctorHome } from "./pages/care/DoctorHome.tsx";
import { HoursPage } from "./pages/care/HoursPage.tsx";
import { PatientPage } from "./pages/care/PatientPage.tsx";
import { SessionPage } from "./pages/care/SessionPage.tsx";
import { ExercisePage } from "./pages/ExercisePage.tsx";
import { LibraryPage } from "./pages/LibraryPage.tsx";
import { MyReports } from "./pages/patient/MyReports.tsx";
import { PatientVisits } from "./pages/patient/PatientVisits.tsx";
import { SessionPlayer } from "./pages/patient/SessionPlayer.tsx";
import { PatientHome } from "./pages/PatientHome.tsx";
import { SignIn } from "./pages/SignIn.tsx";
import { StatusPage } from "./pages/StatusPage.tsx";
import { TryItPage } from "./pages/TryItPage.tsx";

/**
 * Decides which screen to show: the status page at /status, otherwise the sign-in
 * screen, or the home page for the signed-in person's role. The server decides
 * what each role may see; this only picks the matching screen.
 */
export function App() {
  if (window.location.pathname === "/status") return <StatusPage />;
  return <SignedInArea />;
}

function SignedInArea() {
  const me = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false, staleTime: 60_000 } });

  if (me.isPending) {
    return <p className="grid min-h-dvh place-items-center text-ink-soft">Loading…</p>;
  }
  if (me.isError) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="font-medium">Can't reach Kynex right now.</p>
          <button className="mt-3 text-brand-700 underline" onClick={() => me.refetch()}>
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (me.data.status !== 200) return <SignIn />;

  const user = me.data.data;
  const staff = user.role === "clinician" || user.role === "admin";
  const patient = user.role === "patient";
  return (
    <Switch>
      {staff && <Route path="/library">{<LibraryPage me={user} />}</Route>}
      {staff && <Route path="/library/:slug">{(p) => <ExercisePage me={user} slug={p.slug} />}</Route>}
      {staff && <Route path="/library/:slug/try">{(p) => <TryItPage slug={p.slug} />}</Route>}
      {staff && <Route path="/patients/:id">{(p) => <PatientPage me={user} patientId={p.id} />}</Route>}
      {staff && <Route path="/sessions/:id">{(p) => <SessionPage me={user} sessionId={p.id} />}</Route>}
      {staff && <Route path="/calendar">{<CalendarPage me={user} />}</Route>}
      {staff && <Route path="/hours">{<HoursPage me={user} />}</Route>}
      {user.role === "admin" && <Route path="/activity">{<ActivityPage me={user} />}</Route>}
      {user.role === "admin" && <Route path="/accounts">{<AdminHome me={user} />}</Route>}
      {patient && <Route path="/session">{<SessionPlayer me={user} />}</Route>}
      {patient && <Route path="/reports">{<MyReports me={user} />}</Route>}
      {patient && <Route path="/reports/:id">{(p) => <SessionPage me={user} sessionId={p.id} />}</Route>}
      {patient && <Route path="/visits">{<PatientVisits me={user} />}</Route>}
      <Route>
        <Home me={user} />
      </Route>
    </Switch>
  );
}

/** Any other address shows the person's home page. */
function Home({ me }: { me: Me }) {
  switch (me.role) {
    case "patient":
      return <PatientHome me={me} />;
    case "clinician":
      return <DoctorHome me={me} />;
    case "admin":
      return <AdminOverview me={me} />;
  }
}
