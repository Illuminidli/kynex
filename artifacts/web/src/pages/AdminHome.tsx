import { getListUsersQueryKey, useListUsers, useResetUser, type AdminUser, type Me } from "@kynex/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, Shell } from "../components/Shell.tsx";

const ROLE_LABEL: Record<AdminUser["role"], string> = { patient: "Patient", clinician: "Clinician", admin: "Admin" };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export function AdminHome({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const list = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const reset = useResetUser();
  const [notice, setNotice] = useState<string>();

  async function resetAccount(user: AdminUser) {
    const ok = window.confirm(
      `Reset ${user.displayName} to fresh?\n\nThis signs them out on every device, unlocks the account, and starts their journey again from scratch.`,
    );
    if (!ok) return;
    setNotice(undefined);
    const res = await reset.mutateAsync({ userId: user.id }).catch(() => undefined);
    if (res?.status === 200) {
      setNotice(`${user.displayName} has been reset to fresh.`);
      await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } else {
      setNotice(res && "error" in res.data ? res.data.error : "The reset didn't go through. Please try again.");
    }
  }

  const users = list.data?.status === 200 ? list.data.data.users : [];

  return (
    <Shell me={me} title="Test accounts">
      <p className="-mt-2 text-sm text-ink-soft">
        Everyone who can sign in to {me.clinic.name}. All share the test password. <b>Reset to fresh</b> lets a tester go through the
        journey again from the start.
      </p>
      {notice && (
        <p role="status" className="rounded-xl bg-brand-50 px-4 py-2 text-sm text-brand-800">
          {notice}
        </p>
      )}
      <Card>
        {list.isPending ? (
          <p className="text-ink-soft">Loading…</p>
        ) : (
          <ul className="divide-y divide-line">
            {users.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {user.displayName}{" "}
                    <span className="ml-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{ROLE_LABEL[user.role]}</span>
                    {user.lockedUntil && (
                      <span className="ml-1 rounded-md bg-bad-soft px-2 py-0.5 text-xs font-semibold text-bad">
                        Locked until {new Date(user.lockedUntil).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-ink-soft">{user.email}</p>
                  <p className="text-xs text-ink-faint">
                    Last sign-in: {user.lastSignInAt ? when(user.lastSignInAt) : "never"} · Fresh since {when(user.freshSince)}
                  </p>
                </div>
                {user.id !== me.id && (
                  <button
                    className="rounded-xl border border-line px-3 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50"
                    disabled={reset.isPending}
                    onClick={() => resetAccount(user)}
                  >
                    Reset to fresh
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <a href="/status" className="text-center text-xs text-ink-faint underline">
        Platform status
      </a>
    </Shell>
  );
}
