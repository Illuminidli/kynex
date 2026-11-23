import type { Me } from "@kynex/api-client-react";
import { useState } from "react";
import { LangSwitch } from "../../components/LangSwitch.tsx";
import { Card, Shell } from "../../components/Shell.tsx";
import { Button } from "../../components/ui.tsx";
import { useLang } from "../../lib/lang.ts";
import { DEFAULT_CHOICE, OPTION_COUNT, playOption, saveSoundSettings, SOUND_INFO, soundSettings } from "../../lib/sounds.ts";

/** The patient's own settings, kept on this phone: language and the session sounds. */
export function SettingsPage({ me }: { me: Me }) {
  const [lang] = useLang();
  const [s, setS] = useState(soundSettings);
  const update = (next: typeof s) => {
    setS(next);
    saveSoundSettings(next);
  };
  const en = lang === "en";
  return (
    <Shell me={me} title={en ? "Settings" : "सेटिंग्स"}>
      <Card title={en ? "Language" : "भाषा"}>
        <div className="mt-2">
          <LangSwitch />
        </div>
      </Card>
      <Card title={en ? "Session sounds" : "सेशन की आवाज़ें"}>
        <p className="mt-1 text-sm text-ink-soft">
          {en
            ? "Each sound means one thing during an exercise. Tap ▶ to hear a tone and choose the one you like. Your choices are kept on this phone."
            : "व्यायाम के दौरान हर आवाज़ का एक मतलब है। ▶ दबाकर सुनिए और अपनी पसंद चुनिए। आपकी पसंद इसी फ़ोन पर रहती है।"}
        </p>
        <label className="mt-3 flex items-center gap-2 font-medium">
          <input type="checkbox" className="size-5" checked={s.on} onChange={(e) => update({ ...s, on: e.target.checked })} />
          {en ? "Play sounds" : "आवाज़ें चलाएँ"}
        </label>
        <ul className={`mt-3 divide-y divide-line ${s.on ? "" : "opacity-50"}`}>
          {SOUND_INFO.map((info) => (
            <li key={info.id} className="py-3">
              <p className="font-semibold">{en ? info.en : info.hi}</p>
              <p className="text-sm text-ink-soft">{en ? info.whenEn : info.whenHi}</p>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={en ? info.en : info.hi}>
                {Array.from({ length: OPTION_COUNT }, (_, i) => {
                  const on = s.choice[info.id] === i;
                  return (
                    <span key={i} className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`${en ? "Play tone" : "टोन सुनें"} ${"ABC"[i]}`}
                        onClick={() => playOption(info.id, i)}
                        className="grid size-11 place-items-center rounded-xl border border-line bg-white text-lg"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => (update({ ...s, choice: { ...s.choice, [info.id]: i } }), playOption(info.id, i))}
                        className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${on ? "bg-brand-700 text-white" : "border border-line bg-white"}`}
                      >
                        {en ? "Tone" : "टोन"} {"ABC"[i]}
                        {DEFAULT_CHOICE[info.id] === i ? (en ? " (clinic's pick)" : " (क्लिनिक की पसंद)") : ""}
                      </button>
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        <Button tone="plain" className="mt-2" onClick={() => update({ on: true, choice: { ...DEFAULT_CHOICE } })}>
          {en ? "Back to the clinic's sounds" : "क्लिनिक की आवाज़ों पर वापस"}
        </Button>
      </Card>
    </Shell>
  );
}
