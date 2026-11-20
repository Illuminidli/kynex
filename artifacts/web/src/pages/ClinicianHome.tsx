import type { Me } from "@kynex/api-client-react";
import { Card, ComingNext, Shell } from "../components/Shell.tsx";

export function ClinicianHome({ me }: { me: Me }) {
  return (
    <Shell me={me} title="My patients">
      <Card>
        <p className="font-medium">No patients yet.</p>
        <p className="mt-1 text-sm text-ink-soft">Adding patients and building their plans arrives in the next modules.</p>
      </Card>
      <ComingNext
        items={[
          { module: "M2", text: "Browse the 25 exercises: body area, camera position and what is measured." },
          { module: "M3", text: "Add a patient and build their plan from the library." },
          { module: "M5", text: "See each patient's results over time, rep by rep, with alerts that need attention." },
        ]}
      />
    </Shell>
  );
}
