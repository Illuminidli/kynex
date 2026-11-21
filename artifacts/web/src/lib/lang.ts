import { useCallback, useSyncExternalStore } from "react";
import type { Lang } from "./voice.ts";

const KEY = "kynex.lang";
const listeners = new Set<() => void>();

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

/** The reading language for exercise text and the voice, remembered on this device. */
export function useLang(): [Lang, (lang: Lang) => void] {
  const lang = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
  );
  const set = useCallback((next: Lang) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // private mode: the choice just isn't remembered
    }
    listeners.forEach((cb) => cb());
  }, []);
  return [lang, set];
}
