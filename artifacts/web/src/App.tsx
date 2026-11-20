import { getGetMeQueryKey, useGetMe } from "@kynex/api-client-react";
import { AdminHome } from "./pages/AdminHome.tsx";
import { ClinicianHome } from "./pages/ClinicianHome.tsx";
import { PatientHome } from "./pages/PatientHome.tsx";
import { SignIn } from "./pages/SignIn.tsx";
import { StatusPage } from "./pages/StatusPage.tsx";

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
  switch (user.role) {
    case "patient":
      return <PatientHome me={user} />;
    case "clinician":
      return <ClinicianHome me={user} />;
    case "admin":
      return <AdminHome me={user} />;
  }
}
