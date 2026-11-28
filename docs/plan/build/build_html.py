"""Builds docs/plan/web/index.html (the shareable Gantt page) from plan_data."""
import json
import pathlib

from plan_data import build

P = build()
OUT = pathlib.Path(__file__).resolve().parent.parent / "web" / "index.html"
OUT.parent.mkdir(exist_ok=True)

DARK = {"lead": "#3987e5", "dev": "#d95926", "physio": "#199e70", "it": "#c98500", "qa": "#d55181",
        "centres": "#0ca30c", "ux": "#9085e9"}
team_css_light = "\n".join(f"  --t-{k}: {t['color']};" for k, t in P["teams"].items())
team_css_dark = "\n".join(f"  --t-{k}: {c};" for k, c in DARK.items())

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kynex Launch Plan</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<style>
/* Layout: summary band, then the full-width weekly Gantt, then roles, RACI, milestones, risks and targets as stacked sections. */
:root {
  color-scheme: light;
  --bg: #f6f8fa;
  --surface: #ffffff;
  --ink: #0e1f2b;
  --ink-2: #4a5a66;
  --muted: #7d8a94;
  --line: #e1e6ea;
  --brand: #0e3147;
  --accent: #2f789f;
  --hol: rgba(14, 49, 71, 0.06);
  --ws: #eaf2f8;
  --critical: #d03b3b; --serious: #ec835a; --good: #0ca30c;
  --display: "Outfit", "Segoe UI", system-ui, sans-serif;
  --body: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
TEAMLIGHT
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #0d1419; --surface: #151f27; --ink: #eef2f5; --ink-2: #b7c3cc; --muted: #8796a1;
    --line: #26343f; --brand: #cfe4f2; --accent: #6db3d8; --hol: rgba(255,255,255,0.05); --ws: #1b2a35;
TEAMDARK
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0d1419; --surface: #151f27; --ink: #eef2f5; --ink-2: #b7c3cc; --muted: #8796a1;
  --line: #26343f; --brand: #cfe4f2; --accent: #6db3d8; --hol: rgba(255,255,255,0.05); --ws: #1b2a35;
TEAMDARK
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--ink); font: 16px/1.5 var(--body); }
.wrap { max-width: 1400px; margin: 0 auto; padding: 32px 20px 64px; display: grid; gap: 40px; }
h1, h2, h3 { font-family: var(--display); color: var(--brand); text-wrap: balance; margin: 0; line-height: 1.15; }
h1 { font-size: clamp(28px, 4vw, 40px); font-weight: 700; }
h2 { font-size: 24px; font-weight: 600; }
h3 { font-size: 17px; font-weight: 600; }
p { margin: 0; }
.lede { color: var(--ink-2); max-width: 70ch; margin-top: 8px; }
header { display: grid; gap: 20px; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.fact { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.fact b { display: block; font-family: var(--display); font-size: 20px; color: var(--brand); font-variant-numeric: tabular-nums; }
.fact span { color: var(--muted); font-size: 13px; }
.fact.golive { border-color: var(--accent); box-shadow: inset 4px 0 0 var(--accent); }
.owner { background: var(--brand); color: var(--bg); border-radius: 10px; padding: 14px 18px; font-weight: 600; }
:root[data-theme="dark"] .owner { color: #0d1419; }
section { display: grid; gap: 16px; }
.sec-head { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: end; justify-content: space-between; }
.legend { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--surface);
  border-radius: 999px; padding: 4px 12px 4px 8px; font: 600 13px var(--body); color: var(--ink); cursor: pointer; }
.chip i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.chip[aria-pressed="false"] { opacity: 0.45; }
.chip:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.note { color: var(--muted); font-size: 13px; }
/* Gantt */
.gantt-box { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow-x: auto; position: relative; }
.gantt { display: grid; grid-template-columns: minmax(300px, 380px) repeat(WEEKS, minmax(40px, 1fr)); min-width: 1300px; font-size: 13.5px; }
.gantt > div { border-bottom: 1px solid var(--line); min-height: 30px; }
.gh { position: sticky; top: 0; background: var(--surface); z-index: 2; font-size: 11.5px; color: var(--muted); text-align: center; padding: 6px 0 4px; line-height: 1.25; font-variant-numeric: tabular-nums; }
.gh b { display: block; color: var(--ink-2); font-size: 12px; }
.gh.mon { text-align: left; padding-left: 4px; color: var(--brand); font-weight: 700; font-size: 12px; border-left: 1px solid var(--line); }
.gh.hol { background: linear-gradient(var(--hol), var(--hol)), var(--surface); }
.gh .flag { color: var(--serious); font-weight: 700; }
.lab { position: sticky; left: 0; background: var(--surface); z-index: 1; padding: 5px 12px; display: flex; align-items: center; gap: 8px; border-right: 1px solid var(--line); }
.lab .who { margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; }
.ws { background: var(--ws) !important; font: 600 14px var(--display); color: var(--brand); }
.cell { position: relative; }
.cell.hol { background: var(--hol); }
.cell.today { box-shadow: inset 2px 0 0 var(--accent); }
.bar { position: absolute; top: 7px; bottom: 7px; border-radius: 4px; z-index: 0; cursor: default; }
.bar:hover, .bar:focus-visible { filter: brightness(1.1); outline: 2px solid var(--ink); outline-offset: 1px; }
.ms { position: absolute; top: 50%; width: 13px; height: 13px; background: var(--brand); transform: translate(-50%, -50%) rotate(45deg); border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--brand); }
.ms.live { background: var(--good); box-shadow: 0 0 0 1px var(--good); width: 16px; height: 16px; }
.row-ms .lab { font-weight: 700; color: var(--brand); }
.row-ms .lab::before { content: "◆"; font-size: 11px; }
.hidden { display: none !important; }
#tip { position: fixed; pointer-events: none; z-index: 10; max-width: 320px; background: var(--brand); color: var(--bg); padding: 10px 12px; border-radius: 8px; font-size: 13px; line-height: 1.4; opacity: 0; transition: opacity .12s; }
:root[data-theme="dark"] #tip { color: #0d1419; }
#tip b { display: block; font-size: 14px; }
/* Tables and cards */
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; display: grid; gap: 8px; align-content: start; }
.card h3 { display: flex; gap: 8px; align-items: center; }
.card h3 i { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.card.lead { grid-column: 1 / -1; border-color: var(--accent); box-shadow: inset 4px 0 0 var(--t-lead); }
.card ul { margin: 0; padding-left: 18px; color: var(--ink-2); }
.card.lead ul { columns: 2 320px; column-gap: 32px; }
.tbl { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14.5px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font: 600 13px var(--body); color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
td.c { text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
td.acc { background: color-mix(in srgb, var(--t-lead) 16%, transparent); color: var(--brand); font-weight: 700; }
tr:last-child td { border-bottom: 0; }
.lvl { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 13px; }
.lvl::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.lvl.High { color: var(--critical); } .lvl.Medium { color: var(--serious); } .lvl.Low { color: var(--good); }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 24px; align-items: start; }
ol, .plain { margin: 0; padding-left: 20px; display: grid; gap: 6px; color: var(--ink-2); }
.rules { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px 16px 18px; }
footer { color: var(--muted); font-size: 13px; }
.mods { display: grid; gap: 14px; }
.mod { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow-x: auto; }
.mod-h { display: flex; gap: 14px; align-items: center; padding: 14px 16px 6px; }
.mid { font: 700 15px var(--display); color: var(--surface); background: var(--t-dev); border-radius: 8px; padding: 6px 10px; min-width: 44px; text-align: center; }
.mod table td:first-child { width: 22%; } .mod table td:nth-child(3) { width: 30%; color: var(--ink-2); }
@media (prefers-reduced-motion: reduce) { #tip { transition: none; } }
</style>
</head>
<body>
<div class="wrap">
<header>
  <div>
    <h1>Kynex by QI Spine: Launch plan</h1>
    <p class="lede">The week-by-week plan from kickoff to go-live at every QI Spine centre: what gets built, who builds it, and when management sees it working.</p>
  </div>
  <div class="facts" id="facts"></div>
  <div class="owner">The Project Head leads Kynex and is management's single point of contact. They own the roadmap, the camera engine and every release, and sign off every deliverable.</div>
</header>

<section id="gantt">
  <div class="sec-head">
    <div><h2>Weekly Gantt</h2><p class="note">Bar colour = team responsible. Striped bar = contingency (only if needed). ◆ = milestone. Shaded weeks contain holidays. Hover a bar for details. Tap a team to show or hide it.</p></div>
    <div class="legend" id="legend"></div>
  </div>
  <div class="gantt-box"><div class="gantt" id="g"></div></div>
</section>

<section id="modules">
  <div><h2>Build modules in detail</h2><p class="note">Every module takes 3 weeks: week 1 build, week 2 build and connect, week 3 test and polish. Track A and Track B run side by side. The Project Head sets the team size and accepts each module at its review.</p></div>
  <div class="mods" id="mods"></div>
</section>

<section id="roles">
  <h2>Who does what</h2>
  <div class="cards" id="rolecards"></div>
  <div class="rules"><h3>How the team works</h3><ol id="rules" style="margin-top:8px"></ol></div>
</section>

<section id="raci">
  <div><h2>Responsibility chart (RACI)</h2><p class="note">R = does the work · A = accountable, final sign-off · C = consulted · I = kept informed</p></div>
  <div class="tbl"><table id="racitbl"></table></div>
</section>

<section id="milestones">
  <h2>Milestones and demos</h2>
  <div class="tbl"><table id="mstbl"></table></div>
</section>

<section id="risks">
  <h2>Risks and decisions</h2>
  <div class="tbl"><table id="risktbl"></table></div>
  <div class="two">
    <div class="rules"><h3>Decisions needed from management in week 1</h3><ol id="decisions" style="margin-top:8px"></ol></div>
    <div class="rules"><h3>Launch success targets (proposed)</h3><table id="targets" style="margin-top:4px"></table></div>
  </div>
</section>

<section id="assumptions">
  <div class="two">
    <div><h2>Planning assumptions</h2><ul class="plain" id="assume" style="margin-top:12px"></ul></div>
    <div><h2>Holidays in the plan</h2><div class="tbl" style="margin-top:12px"><table id="holtbl"></table></div>
    <p class="note" style="margin-top:6px">Source: officeholidays.com. Eid depends on the moon sighting. Regional holidays vary by state.</p></div>
  </div>
</section>
<footer>Plan ${VERSION} · Prepared by the Project Head for QI Spine management</footer>
</div>
<div id="tip" role="tooltip"></div>
<script>
const P = DATA;
const $ = (s) => document.querySelector(s);
const el = (t, cls, html) => { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const N = P.weeks.length;
const holW = new Set(P.weeks.filter((w) => w.holidays.length || w.light).map((w) => w.w));
const TODAY = Math.floor((Date.now() - Date.parse(P.start)) / 6048e5);

// Key facts
const allMs = P.workstreams.flatMap((w) => w.tasks.filter((t) => t.kind === "ms")).sort((a, b) => a.date.localeCompare(b.date));
[["Kickoff", P.kickoffLabel, "The team starts"], ["Build", "7 modules · 3 weeks each", "Two tracks side by side"],
 ["Feature freeze", "Fri 26 Feb 2027", "Demo 4 + store submission"], ["Go-live", P.goLiveLabel, "Every QI Spine centre", "golive"], ["Hypercare ends", "Fri 30 Apr 2027", "Launch report to management"]]
  .forEach(([k, v, s, c]) => { const f = el("div", "fact " + (c || ""), `<span>${k}</span><b>${v}</b><span>${s}</span>`); $("#facts").append(f); });

// Legend / filters
const shown = new Set(Object.keys(P.teams));
for (const [k, t] of Object.entries(P.teams)) {
  const b = el("button", "chip", `<i style="background:var(--t-${k})"></i>${esc(t.name)}`);
  b.type = "button"; b.setAttribute("aria-pressed", "true");
  b.onclick = () => { shown.has(k) ? shown.delete(k) : shown.add(k); b.setAttribute("aria-pressed", shown.has(k)); filter(); };
  $("#legend").append(b);
}

// Gantt grid
const g = $("#g");
g.style.gridTemplateColumns = `minmax(300px, 380px) repeat(${N}, minmax(40px, 1fr))`;
// month row
g.append(el("div", "gh", ""));
let i = 0;
while (i < N) { let j = i; while (j < N && P.weeks[j].month === P.weeks[i].month) j++;
  const m = el("div", "gh mon", P.weeks[i].month); m.style.gridColumn = `span ${j - i}`; g.append(m); i = j; }
g.append(Object.assign(el("div", "gh lab", "<b>Task</b>"), { style: "justify-content:space-between;top:0" }));
for (const w of P.weeks) {
  const h = el("div", "gh" + (holW.has(w.w) ? " hol" : ""), `<b>${w.label}</b>${w.date}${holW.has(w.w) ? '<div class="flag" aria-hidden="true">•</div>' : ""}`);
  if (holW.has(w.w)) h.title = [w.light, ...w.holidays].filter(Boolean).join("; ");
  g.append(h);
}
const rows = [];
const tip = $("#tip");
const showTip = (e, html) => { tip.innerHTML = html; tip.style.opacity = 1; const r = (e.target).getBoundingClientRect();
  tip.style.left = Math.min(innerWidth - 330, Math.max(8, r.left)) + "px"; tip.style.top = (r.bottom + 8 + tip.offsetHeight > innerHeight ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + "px"; };
const hideTip = () => (tip.style.opacity = 0);
for (const ws of P.workstreams) {
  const wsRow = [el("div", "lab ws", esc(ws.name))];
  const fill = el("div", "ws"); fill.style.gridColumn = `span ${N}`; wsRow.push(fill);
  wsRow.forEach((c) => g.append(c));
  const kids = [];
  for (const t of ws.tasks) {
    const ms = t.kind === "ms";
    const team = P.teams[t.team];
    const lab = el("div", "lab", `<span>${esc(t.name)}</span><span class="who">${ms ? t.dateLabel.slice(4, 10) : esc(team.name)}</span>`);
    const cells = [lab];
    for (let w = 0; w < N; w++) {
      const c = el("div", "cell" + (holW.has(w) ? " hol" : "") + (w === TODAY ? " today" : ""));
      cells.push(c);
    }
    const host = cells[1 + t.start];
    const info = `<b>${esc(t.name)}</b>${ms ? esc(t.dateLabel) : `${esc(team.name)} · ${t.from} – ${t.to}`}<br>Accountable: Project Head${t.detail ? "<br>" + esc(t.detail) : ""}`;
    let mark;
    if (ms) {
      const d = (Date.parse(t.date) - Date.parse(P.weeks[t.start].start)) / 864e5;
      mark = el("span", "ms" + (t.name.startsWith("GO-LIVE") ? " live" : ""));
      mark.style.left = `${((d + 0.5) / 7) * 100}%`;
    } else {
      mark = el("span", "bar");
      mark.style.cssText = `left:2px;width:calc(${(t.end - t.start + 1) * 100}% - 4px);background:${t.contingency ? `repeating-linear-gradient(135deg, var(--t-${t.team}) 0 6px, transparent 6px 11px)` : `var(--t-${t.team})`}`;
      if (t.contingency) mark.style.boxShadow = `inset 0 0 0 2px var(--t-${t.team})`;
    }
    mark.tabIndex = 0; mark.setAttribute("aria-label", info.replace(/<[^>]+>/g, " "));
    mark.onmouseenter = mark.onfocus = (e) => showTip(e, info); mark.onmouseleave = mark.onblur = hideTip;
    host.append(mark);
    cells.forEach((c) => g.append(c));
    const row = { team: t.team, ms, cells };
    if (ms) lab.parentElement, cells.forEach((c) => c.classList.add("row-ms-cell")), lab.classList.add("msl");
    kids.push(row);
  }
  rows.push({ head: wsRow, kids });
}
document.querySelectorAll(".msl").forEach((l) => { l.style.fontWeight = 700; l.style.color = "var(--brand)"; l.firstChild.textContent = "◆ " + l.firstChild.textContent; });
function filter() {
  for (const r of rows) { let any = false;
    for (const k of r.kids) { const on = k.ms ? shown.has("lead") || shown.size === Object.keys(P.teams).length : shown.has(k.team); k.cells.forEach((c) => c.classList.toggle("hidden", !on)); any ||= on; }
    r.head.forEach((c) => c.classList.toggle("hidden", !any)); }
}

// Modules
for (const m of P.modules) {
  const c = el("div", "mod");
  c.innerHTML = `<div class="mod-h"><span class="mid">${m.id}</span><div><h3>${esc(m.name)}</h3><p class="note">${esc(m.track)} · W${m.start}-W${m.end} · ${m.from} – ${m.to}</p></div></div>
  <table><thead><tr><th>Component</th><th>What it includes</th><th>Done when</th></tr></thead><tbody>${m.components.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.what)}</td><td>${esc(x.done)}</td></tr>`).join("")}</tbody></table>`;
  $("#mods").append(c);
}
// Roles
for (const r of P.roles) {
  const c = el("div", "card" + (r.team === "lead" && r.title.startsWith("Project Head") ? " lead" : ""));
  c.innerHTML = `<h3><i style="background:var(--t-${r.team})"></i>${esc(r.title)}</h3><ul>${r.duties.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`;
  $("#rolecards").append(c);
}
["All work enters through the Project Head's backlog. Nobody changes scope, design or priorities without the Project Head's approval.",
 "3-week build modules on two tracks: the Project Head scopes each module, the team builds and tests it, and the Project Head accepts it at the review.",
 "Done means built, tested by QA, checked by a physio where it's clinical, and approved by the Project Head.",
 "Only the Project Head reports to management: the Friday update, the monthly demo and decisions.",
 "Code, cloud, stores and data stay in company accounts, with the Project Head as admin. Every release goes through the Project Head."]
  .forEach((t) => $("#rules").append(el("li", "", esc(t))));

// RACI
$("#racitbl").innerHTML = `<thead><tr><th>Workstream</th>${P.raciRoles.map((r) => `<th style="text-align:center">${esc(r)}</th>`).join("")}</tr></thead><tbody>` +
  P.raci.map((r) => `<tr><td>${esc(r[0])}</td>${r.slice(1).map((v) => `<td class="c ${v.includes("A") ? "acc" : ""}">${v}</td>`).join("")}</tr>`).join("") + "</tbody>";
// Milestones
$("#mstbl").innerHTML = `<thead><tr><th>Date</th><th>Week</th><th>Milestone</th><th>Notes</th></tr></thead><tbody>` +
  allMs.map((t) => `<tr><td style="white-space:nowrap;font-variant-numeric:tabular-nums">${t.dateLabel}</td><td>W${t.start}</td><td><b>${esc(t.name)}</b></td><td>${esc(t.detail)}</td></tr>`).join("") + "</tbody>";
// Risks
$("#risktbl").innerHTML = `<thead><tr><th>Risk</th><th>Level</th><th>How it's handled</th></tr></thead><tbody>` +
  P.risks.map((r) => `<tr><td>${esc(r.risk)}</td><td><span class="lvl ${r.level}">${r.level}</span></td><td>${esc(r.mitigation)}</td></tr>`).join("") + "</tbody>";
P.decisions.forEach((d) => $("#decisions").append(el("li", "", esc(d))));
$("#targets").innerHTML = P.targets.map((t) => `<tr><td style="font-weight:600;white-space:nowrap">${esc(t.area)}</td><td>${esc(t.target)}</td></tr>`).join("");
P.assumptions.forEach((a) => $("#assume").append(el("li", "", esc(a))));
$("#holtbl").innerHTML = P.holidays.map((h) => `<tr><td style="white-space:nowrap;font-variant-numeric:tabular-nums">${h.label}</td><td>${esc(h.name)}</td></tr>`).join("");
</script>
</body>
</html>
"""
html = (HTML.replace("TEAMLIGHT", team_css_light).replace("TEAMDARK", team_css_dark)
        .replace("WEEKS", str(len(P["weeks"]))).replace("${VERSION}", P["version"]).replace("DATA", json.dumps(P, ensure_ascii=False)))
OUT.write_text(html, encoding="utf-8")
print("wrote", OUT)
