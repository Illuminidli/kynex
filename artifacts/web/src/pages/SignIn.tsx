import { getGetMeQueryKey, useSignIn } from "@kynex/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

/** Phase 1 test accounts, listed so testers can pick one. Removed before real patients use Kynex. */
const TEST_EMAILS = [
  "admin@kynex.test",
  "clinician1@kynex.test",
  "patient1@kynex.test",
  "patient2@kynex.test",
];

export function SignIn() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const signIn = useSignIn();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(undefined);
    try {
      const res = await signIn.mutateAsync({ data: { email, password } });
      if (res.status === 200) {
        queryClient.setQueryData(getGetMeQueryKey(), res); // shows the home page straight away
        return;
      }
      if (res.status === 423) {
        const until = new Date(res.data.lockedUntil).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
        setMessage(`${res.data.error} Try again after ${until}.`);
        return;
      }
      setMessage(res.data.error);
    } catch {
      setMessage("Can't reach Kynex right now. Check your connection and try again.");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <header className="flex items-center gap-3">
        <img src="/icon.svg" alt="" className="size-11 rounded-2xl shadow-soft" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kynex</h1>
          <p className="text-sm text-ink-soft">Sign in to continue</p>
        </div>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-soft">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-line px-3 py-2.5 text-base font-normal outline-none focus:border-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-line px-3 py-2.5 text-base font-normal outline-none focus:border-brand-500"
          />
        </label>
        {message && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={signIn.isPending}
          className="rounded-xl bg-brand-700 px-4 py-3 font-medium text-white disabled:opacity-60"
        >
          {signIn.isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <details className="rounded-3xl border border-line bg-white/60 p-5 text-sm text-ink-soft">
        <summary className="cursor-pointer font-medium text-ink">Test accounts (phase 1)</summary>
        <p className="mt-2">All use the shared test password. Tap one to fill it in.</p>
        <ul className="mt-2 grid grid-cols-1 gap-1">
          {TEST_EMAILS.map((testEmail) => (
            <li key={testEmail}>
              <button type="button" className="text-brand-700 underline" onClick={() => setEmail(testEmail)}>
                {testEmail}
              </button>
            </li>
          ))}
        </ul>
      </details>

      <a href="/status" className="text-center text-xs text-ink-faint underline">
        Platform status
      </a>
    </main>
  );
}
