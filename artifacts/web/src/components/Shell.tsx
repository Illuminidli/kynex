import { useSignOut, type Me } from "@kynex/api-client-react";
import type { ReactNode } from "react";

const ROLE_LABEL: Record<Me["role"], string> = { patient: "Patient", clinician: "Clinician", admin: "Admin" };

/** Frame shared by every signed-in page: logo, who is signed in, sign-out. */
export function Shell({ me, title, children }: { me: Me; title: string; children: ReactNode }) {
  const signOut = useSignOut({
    mutation: {
      // Reload from scratch so nothing about this person stays in the page's memory.
      onSettled: () => window.location.assign("/"),
    },
  });

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3">
          <img src="/icon.svg" alt="" className="size-9 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{me.displayName}</p>
            <p className="truncate text-xs text-ink-soft">
              {ROLE_LABEL[me.role]} · {me.clinic.name}
            </p>
          </div>
          <button
            className="rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink-soft hover:bg-canvas disabled:opacity-50"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </main>
    </div>
  );
}

/** A white card with an optional heading. */
export function Card({ title, children, tone = "plain" }: { title?: string; children: ReactNode; tone?: "plain" | "brand" }) {
  return (
    <section className={`rounded-3xl p-5 shadow-soft ${tone === "brand" ? "bg-brand-700 text-white" : "bg-white"}`}>
      {title && <h2 className="mb-1 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

/** "Coming next" list so testers know what each empty page will hold. */
export function ComingNext({ items }: { items: { module: string; text: string }[] }) {
  return (
    <Card title="Coming next">
      <ul className="mt-2 space-y-2 text-sm text-ink-soft">
        {items.map((item) => (
          <li key={item.module} className="flex gap-3">
            <span className="shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{item.module}</span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
