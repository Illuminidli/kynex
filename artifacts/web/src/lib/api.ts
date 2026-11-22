import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

/** What the generated client returns: the body and the HTTP status. */
type Reply = { status: number; data: unknown };

/** The body of a successful reply, or throws an Error with the server's message. */
export async function must<T extends Reply>(call: Promise<T>): Promise<Extract<T, { status: 200 | 204 }>["data"]> {
  let res: T;
  try {
    res = await call;
  } catch {
    throw new Error("Can't reach Kynex. Check your connection and try again.");
  }
  if (res.status === 200 || res.status === 204) return res.data as never;
  const body = res.data as { error?: string } | undefined;
  throw new Error(body?.error ?? "Something went wrong. Please try again.");
}

/** The data of a query when it succeeded. */
export function ok<T extends Reply>(q: { data?: T }): Extract<T, { status: 200 }>["data"] | undefined {
  return q.data?.status === 200 ? (q.data.data as never) : undefined;
}

/** The error message of a query that came back with an error status. */
export function failed<T extends Reply>(q: { data?: T; isError: boolean }): string | null {
  if (q.isError) return "Can't reach Kynex. Check your connection and reload.";
  if (q.data && q.data.status !== 200) return (q.data.data as { error?: string }).error ?? "Couldn't load this.";
  return null;
}

/**
 * Runs a change (save, book, cancel...), keeps its busy and error state, and refreshes every
 * query afterwards so all screens show the new state.
 */
export function useAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        const out = await work();
        await qc.invalidateQueries();
        return out;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [qc],
  );
  return { run, busy, error, setError };
}
