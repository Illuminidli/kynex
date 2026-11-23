import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  tone = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "accent" | "plain" | "danger" | "quiet" }) {
  const look = {
    primary: "bg-brand-700 text-white hover:bg-brand-800",
    accent: "bg-accent-500 text-white hover:bg-accent-600",
    plain: "border border-line bg-white text-ink hover:bg-canvas",
    danger: "border border-bad/30 bg-white text-bad hover:bg-bad-soft",
    quiet: "text-brand-700 underline underline-offset-2",
  }[tone];
  return (
    <button
      type="button"
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${tone === "quiet" ? "px-0 py-0" : ""} ${look} ${className}`}
      {...rest}
    />
  );
}

export function Badge({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "bad" | "good" | "warn" | "plain" }) {
  const look = {
    brand: "bg-brand-50 text-brand-700",
    bad: "bg-bad-soft text-bad",
    good: "bg-good-soft text-good",
    warn: "bg-accent-50 text-accent-600",
    plain: "bg-canvas text-ink-soft",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${look}`}>{children}</span>;
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          type="button"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${value === o.key ? "bg-brand-700 text-white" : "bg-white text-ink-soft shadow-soft"}`}
        >
          {o.label}
          {o.count ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${value === o.key ? "bg-white/20" : "bg-bad-soft text-bad"}`}>{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

export const inputCls = "rounded-xl border border-line bg-white px-3 py-2 text-base outline-none focus:border-brand-500";

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
      {children}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">
      {children}
    </p>
  );
}

export function Loading() {
  return <p className="text-ink-soft">Loading…</p>;
}

/** 0-10 pain buttons. */
export function PainScale({ value, onChange, lang = "en" }: { value: number | null; onChange: (v: number) => void; lang?: "en" | "hi" }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${n} out of 10`}
            onClick={() => onChange(n)}
            className={`aspect-square rounded-lg text-sm font-semibold ${value === n ? "bg-brand-700 text-white" : n >= 7 ? "bg-bad-soft text-bad" : n >= 4 ? "bg-accent-50 text-accent-600" : "bg-good-soft text-good"}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-ink-faint">
        <span>{lang === "en" ? "0 = no pain" : "0 = कोई दर्द नहीं"}</span>
        <span>{lang === "en" ? "10 = worst pain" : "10 = सबसे ज़्यादा दर्द"}</span>
      </div>
    </div>
  );
}

export const FEELINGS = [
  { key: "easy", en: "Easy", hi: "आसान", tone: "good" },
  { key: "ok", en: "OK", hi: "ठीक", tone: "brand" },
  { key: "hard", en: "Hard", hi: "मुश्किल", tone: "warn" },
  { key: "painful", en: "Painful", hi: "दर्द हुआ", tone: "bad" },
] as const;

export const feelingWord = (f: string | null, lang: "en" | "hi" = "en") => FEELINGS.find((x) => x.key === f)?.[lang] ?? "–";

export const ATTENTION_TONE: Record<string, "bad" | "warn" | "brand"> = {
  "red-flag": "bad",
  symptom: "bad",
  pain: "bad",
  painful: "warn",
  missed: "warn",
  form: "warn",
  review: "brand",
};
