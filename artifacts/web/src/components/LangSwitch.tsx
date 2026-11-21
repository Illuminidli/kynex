import { useLang } from "../lib/lang.ts";

/** English / हिंदी switch for exercise text and the voice. */
export function LangSwitch({ dark = false }: { dark?: boolean }) {
  const [lang, setLang] = useLang();
  const base = dark ? "border-white/30 text-white" : "border-line text-ink-soft";
  const on = dark ? "bg-white text-brand-900" : "bg-brand-700 text-white";
  return (
    <div role="group" aria-label="Language" className={`inline-flex shrink-0 overflow-hidden rounded-xl border text-sm ${base}`}>
      {(["en", "hi"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`px-3 py-1.5 font-medium ${lang === l ? on : ""}`}
        >
          {l === "en" ? "English" : "हिंदी"}
        </button>
      ))}
    </div>
  );
}
