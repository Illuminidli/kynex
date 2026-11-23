/** Dates and times are always shown in clinic time (India), whatever the device's own zone. */
const TZ = "Asia/Kolkata";
type L = "en" | "hi";
const loc = (lang: L) => (lang === "hi" ? "hi-IN" : "en-IN");

export const timeText = (iso: string, lang: L = "en") =>
  new Date(iso).toLocaleTimeString(loc(lang), { timeZone: TZ, hour: "numeric", minute: "2-digit" });
export const dateText = (isoOrDay: string, lang: L = "en") =>
  new Date(isoOrDay.length === 10 ? `${isoOrDay}T12:00:00+05:30` : isoOrDay).toLocaleDateString(loc(lang), {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
export const dateTimeText = (iso: string, lang: L = "en") => `${dateText(iso, lang)}, ${timeText(iso, lang)}`;
export const shortDay = (day: string) =>
  new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: TZ, day: "numeric", month: "short" });

/** "YYYY-MM-DD" in clinic time. */
export function dayOf(d: Date): string {
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
export const todayDay = () => dayOf(new Date());
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

export const WEEKDAYS = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], hi: ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"] };

export function weekdaysText(days: number[], lang: L = "en") {
  const s = [...days].sort();
  if (s.length === 7) return lang === "en" ? "Every day" : "रोज़";
  if (s.join() === "1,2,3,4,5,6") return lang === "en" ? "Mon–Sat" : "सोम–शनि";
  if (s.join() === "1,2,3,4,5") return lang === "en" ? "Mon–Fri" : "सोम–शुक्र";
  return s.map((d) => WEEKDAYS[lang][d]).join(", ");
}

export const minutesText = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return dateText(iso);
};

export const unitText = (unit: string) => (unit === "deg" ? "°" : unit === "cm" ? " cm" : ` ${unit}`);
export const valueText = (v: number | null | undefined, unit: string) =>
  v === null || v === undefined ? "–" : `${unit === "deg" ? Math.round(v) : Math.round(v * 10) / 10}${unitText(unit)}`;
