import type { Me } from "@kynex/api-client-react";
import { Card, ComingNext, Shell } from "../components/Shell.tsx";

export function PatientHome({ me }: { me: Me }) {
  return (
    <Shell me={me} title={`Hello, ${me.displayName}`}>
      <Card title="Today's exercises" tone="brand">
        <p className="text-white/80">Your clinician hasn't set your plan yet. It will appear here once they do.</p>
      </Card>
      <ComingNext
        items={[
          { module: "M2", text: "See the exercise library with a short demo of each exercise." },
          { module: "M3", text: "Your plan from your clinician: which exercises, how many sets and reps, which days." },
          { module: "M4", text: "Do each exercise in front of your phone camera; it counts and checks your form." },
        ]}
      />
    </Shell>
  );
}
