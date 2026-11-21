import type { Me } from "@kynex/api-client-react";
import { Card, ComingNext, LibraryLink, Shell } from "../components/Shell.tsx";

export function ClinicianHome({ me }: { me: Me }) {
  return (
    <Shell me={me} title="My patients">
      <LibraryLink />
      <Card>
        <p className="font-medium">No patients yet.</p>
        <p className="mt-1 text-sm text-ink-soft">Adding patients and building their plans arrives in the next modules.</p>
      </Card>
      <ComingNext
        items={[
          { module: "M3", text: "Add a patient and prescribe exercises from the library: sets, reps, hold, rest, how often, dates." },
          { module: "M4", text: "Your patients do their plan in the exercise player, counted by the camera with a natural voice." },
          { module: "M5", text: "See each patient's results over time, rep by rep, with alerts that need attention." },
        ]}
      />
    </Shell>
  );
}
