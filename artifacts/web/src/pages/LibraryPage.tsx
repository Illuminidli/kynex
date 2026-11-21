import { getListExercisesQueryKey, useListExercises, type ExerciseSummary, type Me } from "@kynex/api-client-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { LangSwitch } from "../components/LangSwitch.tsx";
import { Card, Shell } from "../components/Shell.tsx";
import { useLang } from "../lib/lang.ts";
import { label, POSITION_LABELS, regionLabel, t, VIEW_LABELS } from "../lib/labels.ts";

/** Body-area filter: the engine's areas grouped the way clinicians talk about them. */
const AREAS = ["neck", "shoulder", "spine", "hip", "knee", "ankle"] as const;
const AREA_OF: Record<string, (typeof AREAS)[number]> = { elbow: "shoulder", core: "spine", balance: "ankle" };
const AREA_NAMES: Record<string, { en: string; hi: string }> = { spine: { en: "Back", hi: "पीठ" } };

/** Position filter: lying covers on the back, on the front and on hands and knees. */
const POSITIONS = ["standing", "seated", "lying"] as const;
const POSITION_OF: Record<string, (typeof POSITIONS)[number]> = { supine: "lying", prone: "lying", quadruped: "lying" };
const POSITION_NAMES = {
  standing: { en: "Standing", hi: "खड़े" },
  seated: { en: "Sitting", hi: "बैठकर" },
  lying: { en: "Lying / floor", hi: "लेटकर / ज़मीन पर" },
};

export function LibraryPage({ me }: { me: Me }) {
  const [lang] = useLang();
  const [search, setSearch] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const list = useListExercises({ query: { queryKey: getListExercisesQueryKey() } });
  const all = list.data?.status === 200 ? list.data.data.exercises : [];

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (e) =>
        (!q || e.name.en.toLowerCase().includes(q) || e.name.hi.includes(q) || e.summary.en.toLowerCase().includes(q)) &&
        (!area || (AREA_OF[e.region] ?? e.region) === area) &&
        (!position || (POSITION_OF[e.position] ?? e.position) === position),
    );
  }, [all, search, area, position]);

  return (
    <Shell me={me} title={t("library", lang)} back={{ href: "/", label: "Home" }} aside={<LangSwitch />}>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("search", lang)}
        aria-label={t("search", lang)}
        className="rounded-2xl border border-line bg-white px-4 py-3 text-base outline-none focus:border-brand-500"
      />
      <Chips
        label="Body area"
        options={AREAS.map((a) => ({ key: a, text: AREA_NAMES[a]?.[lang] ?? regionLabel(a, lang) }))}
        value={area}
        onChange={setArea}
        all={t("all", lang)}
      />
      <Chips
        label="Position"
        options={POSITIONS.map((p) => ({ key: p, text: POSITION_NAMES[p][lang] }))}
        value={position}
        onChange={setPosition}
        all={t("all", lang)}
      />

      {list.isPending && <p className="text-ink-soft">Loading…</p>}
      {list.isError && <p className="text-bad">Couldn't load the library. Check your connection and reload.</p>}
      {list.data && list.data.status !== 200 && <p className="text-bad">{list.data.data.error}</p>}

      {!list.isPending && (
        <p className="-mb-2 text-sm text-ink-soft">
          {shown.length} of {all.length}
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((e) => (
          <li key={e.slug}>
            <ExerciseCard exercise={e} lang={lang} />
          </li>
        ))}
      </ul>
      {!list.isPending && all.length > 0 && shown.length === 0 && (
        <Card>
          <p className="text-ink-soft">{t("none", lang)}</p>
        </Card>
      )}
    </Shell>
  );
}

function ExerciseCard({ exercise: e, lang }: { exercise: ExerciseSummary; lang: "en" | "hi" }) {
  return (
    <Link
      href={`/library/${e.slug}`}
      className={`flex h-full flex-col gap-2 rounded-3xl bg-white p-4 shadow-soft transition hover:ring-2 hover:ring-brand-200 ${e.hidden ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold">{e.name[lang]}</h2>
        {e.hidden && <span className="shrink-0 rounded-md bg-bad-soft px-2 py-0.5 text-xs font-semibold text-bad">{t("hidden", lang)}</span>}
      </div>
      <p className="text-sm text-ink-soft">{e.summary[lang]}</p>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1 text-xs">
        <Tag>{regionLabel(e.region, lang)}</Tag>
        <Tag>{label(POSITION_LABELS, e.position, lang)}</Tag>
        <Tag>{label(VIEW_LABELS, e.view, lang)}</Tag>
      </div>
    </Link>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{children}</span>;
}

function Chips({
  label: groupLabel,
  options,
  value,
  onChange,
  all,
}: {
  label: string;
  options: { key: string; text: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
  all: string;
}) {
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${active ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white text-ink-soft"}`;
  return (
    <div role="group" aria-label={groupLabel} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      <button type="button" aria-pressed={value === null} className={chip(value === null)} onClick={() => onChange(null)}>
        {all}
      </button>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          className={chip(value === o.key)}
          onClick={() => onChange(value === o.key ? null : o.key)}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}
