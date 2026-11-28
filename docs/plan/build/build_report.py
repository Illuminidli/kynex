"""Builds the designed Gantt report: docs/plan/Kynex-Launch-Plan-Report.pdf (A4 landscape).

Source data comes from plan_data.py, the same source the Sheet, Excel, web page and deck use.
Run: python build_report.py   (needs Microsoft Edge for the PDF export)
"""
import datetime as dt
import html
import pathlib
import subprocess

from plan_data import build

P = build()
HERE = pathlib.Path(__file__).resolve().parent
OUT_HTML = HERE.parent / "report" / "kynex-launch-plan-report.html"
OUT_PDF = HERE.parent / "Kynex-Launch-Plan-Report.pdf"
OUT_HTML.parent.mkdir(exist_ok=True)
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

E = html.escape
N = len(P["weeks"])
START = dt.date.fromisoformat(P["start"])
TEAMS = P["teams"]
HOL = {w["w"]: "; ".join(filter(None, [w["light"], *w["holidays"]])) for w in P["weeks"] if w["holidays"] or w["light"]}
MS_ALL = sorted([t for w in P["workstreams"] for t in w["tasks"] if t["kind"] == "ms"], key=lambda t: t["date"])
TOTAL_PAGES = 0  # filled in after layout


def pct(x: float) -> str:
    return f"{x / N * 100:.3f}%"


def day_pos(iso: str) -> float:
    """Position in weeks (0..N) of the middle of the given day."""
    d = dt.date.fromisoformat(iso)
    return (d - START).days / 7 + 0.5 / 7


def grid_bg() -> str:
    """Week columns: holiday shading and light dividers, drawn once per track."""
    cells = []
    for w in range(N):
        cls = "wk hol" if w in HOL else "wk"
        cells.append(f'<i class="{cls}" style="left:{pct(w)};width:{pct(1)}"></i>')
    return "".join(cells)


def week_header() -> str:
    months, i = [], 0
    while i < N:
        j = i
        while j < N and P["weeks"][j]["month"] == P["weeks"][i]["month"]:
            j += 1
        months.append(f'<span class="mon" style="left:{pct(i)};width:{pct(j - i)}">{E(P["weeks"][i]["month"])}</span>')
        i = j
    weeks = "".join(
        f'<span class="wkh{" hol" if w["w"] in HOL else ""}" style="left:{pct(w["w"])};width:{pct(1)}" title="{E(HOL.get(w["w"], ""))}"><b>{w["label"]}</b>{w["date"]}</span>'
        for w in P["weeks"])
    return f'<div class="months">{"".join(months)}</div><div class="weeks">{weeks}</div>'


def gantt_head() -> str:
    return f'<div class="ghead"><div class="glab"><span>Task</span><span>Responsible</span></div><div class="gtrack">{week_header()}</div></div>'


def task_row(t: dict, n: int) -> str:
    team = TEAMS[t["team"]]
    if t["kind"] == "ms":
        pos = day_pos(t["date"])
        live = " live" if t["name"].startswith("GO-LIVE") else ""
        mark = f'<span class="dia{live}" style="left:{pct(pos)}"></span><span class="mslbl" style="left:calc({pct(pos)} + 9px)">{E(t["dateLabel"][4:10])}</span>'
        who = "Project Head"
        cls = "row ms"
    else:
        style = f'left:{pct(t["start"])};width:calc({pct(t["end"] - t["start"] + 1)} - 2px);--c:{team["color"]}'
        mark = f'<span class="barx{" cont" if t.get("contingency") else ""}" style="{style}"></span>'
        who = team["name"]
        cls = "row"
    name = E(t["name"])
    return (f'<div class="{cls}"><div class="glab"><span class="tn"><em>{n}</em>{name}</span><span class="who"><i style="background:{team["color"]}"></i>{E(who)}</span></div>'
            f'<div class="gtrack">{grid_bg()}{mark}</div></div>')


def legend() -> str:
    teams = "".join(f'<span><i style="background:{t["color"]}"></i>{E(t["name"])}</span>' for t in TEAMS.values())
    return (f'<div class="legend">{teams}<span><i class="hatch"></i>Contingency</span><span><i class="dlg"></i>Milestone</span>'
            f'<span><i class="holg"></i>Holiday week</span></div>')


def page(body: str, title: str, eyebrow: str, cls: str = "") -> str:
    return f'''<section class="page {cls}"><header class="ph"><div><div class="eyebrow">{E(eyebrow)}</div><h2>{E(title)}</h2></div><div class="phr"><b>Kynex by QI Spine</b><span>Launch plan · {E(P["version"])}</span></div></header>{body}<footer class="pf"><span>Kynex by QI Spine · Launch plan · Owner and single point of contact: Project Head</span><span class="pn"></span></footer></section>'''


pages = []

# ---------------- Cover ----------------
mod_rows = "".join(
    f'<div class="cm"><b>{m["id"]}</b><span>{E(m["name"])}</span><em>{E(m["track"])} · {m["from"]} – {m["to"]}</em></div>'
    for m in P["modules"] if m["id"] != "H")
pages.append(f'''<section class="page cover">
  <div class="brand"><span class="mark"><svg viewBox="0 0 24 24"><path d="M7 4v16M7 12l9-8M7 12l10 8" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Kynex <span class="by">by QI Spine</span></div>
  <div class="ctext">
    <div class="eyebrow" style="color:#f6b27f">Launch plan · Gantt report</div>
    <h1>From kickoff to every QI Spine centre in four months</h1>
    <p>A week-by-week plan for building, testing and launching Kynex on Android, iPhone and the web, with the teams, milestones, risks and decisions needed to get there.</p>
  </div>
  <div class="cfacts">
    <div><span>Kickoff</span><b>{P["kickoffLabel"]}</b></div>
    <div><span>Feature freeze</span><b>Fri 26 Feb 2027</b></div>
    <div class="hot"><span>Go-live, all centres</span><b>{P["goLiveLabel"]}</b></div>
    <div><span>Hypercare ends</span><b>Fri 30 Apr 2027</b></div>
  </div>
  <div class="cfoot"><span>Prepared by the Project Head for QI Spine management</span><span>Plan {E(P["version"])}</span></div>
</section>''')

# ---------------- Plan on a page ----------------
phase_rows = []
for i, w in enumerate(P["workstreams"]):
    tasks = [t for t in w["tasks"] if t["kind"] == "task" and not t.get("contingency")]
    s = min(t["start"] for t in tasks)
    e = max(t["end"] for t in tasks)
    # draw each task faintly and the overall span strongly
    segs = "".join(
        f'<span class="seg" style="left:{pct(t["start"])};width:calc({pct(t["end"] - t["start"] + 1)} - 2px);background:{TEAMS[t["team"]]["color"]}"></span>'
        for t in tasks)
    name = w["name"].split(". ", 1)[1]
    phase_rows.append(f'<div class="orow"><div class="olab"><b>{i + 1}</b>{E(name)}</div><div class="otrack">{grid_bg()}<span class="span" style="left:{pct(s)};width:{pct(e - s + 1)}"></span>{segs}</div></div>')
ms_dots, ms_list, prev = [], [], -9
for k, t in enumerate([m for m in MS_ALL if m["name"].split(":")[0] in (
        "Kickoff", "Plan, charter & budget approved", "Demo 1", "Demo 2", "Demo 3", "Demo 4", "Video route decided", "Go / no-go decision",
        "GO-LIVE", "Launch report + Phase 2 roadmap", "Release candidate")], 1):
    pos = day_pos(t["date"])
    live = " live" if t["name"].startswith("GO-LIVE") else ""
    top = "28%" if pos - prev < 0.6 else "50%"
    if top == "28%":
        ms_dots[-1] = ms_dots[-1].replace('top:50%', 'top:72%')
    ms_dots.append(f'<span class="odot{live}" style="left:calc({pct(pos)} - 8px);top:{top}">{k}</span>')
    prev = pos
    ms_list.append(f'<div class="oml{live}"><b>{k}</b><span>{E(t["dateLabel"][:10])}</span><em>{E(t["name"])}</em></div>')
body = f'''
<div class="onepage">
  <div class="ohead"><div class="olab"></div><div class="otrack head">{week_header()}</div></div>
  {"".join(phase_rows)}
  <div class="orow msrow"><div class="olab"><b>◆</b>Key milestones</div><div class="otrack">{grid_bg()}{"".join(ms_dots)}</div></div>
</div>
<div class="omsgrid">{"".join(ms_list)}</div>
<div class="onote">{legend()}<span>Each bar shows every task in that workstream. The full task-level Gantt follows on the next pages.</span></div>
'''
pages.append(page(body, "The plan on one page", "Overview"))

# ---------------- Full Gantt, packed into pages ----------------
chunks, cur, rows = [], [], 0
for w in P["workstreams"]:
    need = len(w["tasks"]) + 1
    if rows + need > 31 and cur:
        chunks.append(cur)
        cur, rows = [], 0
    cur.append(w)
    rows += need
chunks.append(cur)
n = 0
for ci, ch in enumerate(chunks, 1):
    rws = []
    for w in ch:
        rws.append(f'<div class="row wsh"><div class="glab"><span>{E(w["name"])}</span></div><div class="gtrack">{grid_bg()}</div></div>')
        for t in w["tasks"]:
            n += 1
            rws.append(task_row(t, n))
    body = f'<div class="gantt">{gantt_head()}{"".join(rws)}</div>{legend()}'
    pages.append(page(body, f"Weekly Gantt · part {ci} of {len(chunks)}", "Task-level plan"))

# ---------------- Build modules ----------------
def module_block(m):
    comps = "".join(f'<tr><td class="c1">{E(c["name"])}</td><td>{E(c["what"])}</td><td class="c3">{E(c["done"])}</td></tr>' for c in m["components"])
    return (f'<div class="mod"><div class="modh"><span class="mid">{m["id"]}</span><div><b>{E(m["name"])}</b><span>{E(m["track"])} · W{m["start"]}–W{m["end"]} · {m["from"]} – {m["to"]}</span></div></div>'
            f'<table class="mt"><tr><th>Component</th><th>What it includes</th><th>Done when</th></tr>{comps}</table></div>')

mods = P["modules"]
intro = '<p class="lede">Every module takes 3 weeks: week 1 build, week 2 build and connect, week 3 test and polish. Track A (patient side) and Track B (clinic side) run side by side. The Project Head sets the team size and accepts each module at its review.</p>'
pages.append(page(intro + '<div class="mods">' + "".join(module_block(m) for m in mods[:2]) + "</div>", "Build modules in detail · 1 of 3", "Engineering"))
pages.append(page('<div class="mods">' + "".join(module_block(m) for m in mods[2:4]) + "</div>", "Build modules in detail · 2 of 3", "Engineering"))
pages.append(page('<div class="mods">' + "".join(module_block(m) for m in mods[4:]) + "</div>", "Build modules in detail · 3 of 3", "Engineering"))

# ---------------- Milestones ----------------
ms_rows = "".join(
    f'<tr class="{"golive" if t["name"].startswith("GO-LIVE") else ""}"><td class="d">{E(t["dateLabel"])}</td><td class="w">W{t["start"]}</td><td><b>{E(t["name"])}</b></td><td class="n">{E(t["detail"])}</td></tr>'
    for t in MS_ALL)
pages.append(page(f'<table class="tbl"><tr><th>Date</th><th>Week</th><th>Milestone</th><th>Notes</th></tr>{ms_rows}</table>', "Milestones and demos", "Dates management will see working"))

# ---------------- Roles + RACI ----------------
role_cards = "".join(
    f'<div class="role{" lead" if i == 0 else ""}"><h4><i style="background:{TEAMS[r["team"]]["color"]}"></i>{E(r["title"])}</h4><ul>{"".join(f"<li>{E(d)}</li>" for d in r["duties"])}</ul></div>'
    for i, r in enumerate(P["roles"]))
pages.append(page(f'<div class="roles">{role_cards}</div>', "Who does what", "Roles and responsibilities"))
raci_head = "".join(f"<th>{E(r)}</th>" for r in P["raciRoles"])
raci_rows = "".join(
    "<tr><td class='rl'>" + E(r[0]) + "</td>" + "".join(f'<td class="{"a" if "A" in v else ("r" if v == "R" else "")}">{v}</td>' for v in r[1:]) + "</tr>"
    for r in P["raci"])
rules = [
    "All work enters through the Project Head's backlog. Nobody changes scope, design or priorities without the Project Head's approval.",
    "3-week build modules on two tracks: the Project Head scopes each module, the team builds and tests it, and the Project Head accepts it at the review.",
    "Done means built, tested by QA, checked by a physio where it's clinical, and approved by the Project Head.",
    "Only the Project Head reports to management: the Friday update, the demos and decisions.",
    "Code, cloud, stores and data stay in company accounts, with the Project Head as admin. Every release goes through the Project Head.",
]
pages.append(page(
    f'<div class="racigrid"><table class="raci"><tr><th class="rl">Workstream</th>{raci_head}</tr>{raci_rows}</table>'
    f'<div class="rules"><h4>How the team works</h4><ol>{"".join(f"<li>{E(x)}</li>" for x in rules)}</ol>'
    f'<p class="key"><b>R</b> does the work · <b>A</b> accountable, final sign-off · <b>C</b> consulted · <b>I</b> kept informed</p></div></div>',
    "Responsibility chart (RACI)", "Roles and responsibilities"))

# ---------------- Risks + decisions ----------------
risk_rows = "".join(
    f'<tr><td><b>{E(r["risk"])}</b></td><td><span class="lvl {r["level"]}">{r["level"]}</span></td><td>{E(r["mitigation"])}</td></tr>' for r in P["risks"])
dec = "".join(f"<li>{E(d)}</li>" for d in P["decisions"])
pages.append(page(
    f'<div class="riskgrid"><table class="tbl risk"><tr><th>Risk</th><th>Level</th><th>How it\'s handled</th></tr>{risk_rows}</table>'
    f'<div class="dec"><h4>Decisions needed from management in week 1</h4><ol>{dec}</ol></div></div>',
    "Risks and decisions", "What could slow us down"))

# ---------------- Targets, holidays, assumptions ----------------
tg = "".join(f'<div class="tg"><span>{E(t["area"])}</span><p>{E(t["target"])}</p></div>' for t in P["targets"])
hol = "".join(f'<tr><td class="d">{E(h["label"])}</td><td>{E(h["name"])}</td></tr>' for h in P["holidays"])
asm = "".join(f"<li>{E(a)}</li>" for a in P["assumptions"])
pages.append(page(
    f'<div class="last"><div><h4>Launch success targets <span class="soft">(proposed, to confirm in week 1)</span></h4><div class="tgs">{tg}</div>'
    f'<h4 style="margin-top:6mm">Planning assumptions</h4><ul class="asm">{asm}</ul></div>'
    f'<div><h4>Holidays built into the plan</h4><table class="tbl hol">{hol}</table><p class="src">Dates from officeholidays.com. Eid depends on the moon sighting. Regional holidays vary by state. Holi week (22–26 Mar) is buffer only.</p></div></div>',
    "Targets, holidays and assumptions", "Measuring the launch"))

CSS = r"""
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
:root { --navy:#0e3147; --teal:#2f789f; --teal-d:#1d6189; --b50:#f0f6fa; --b100:#dcebf4; --orange:#f2812e; --canvas:#f6f8fa; --line:#e5eaf0; --ink:#16222f; --ink-2:#475569; --ink-3:#8a97a8; --good:#2f9e73; --bad:#cf4b45;
  --display:"Outfit","Segoe UI",sans-serif; --body:"Source Sans 3","Segoe UI",sans-serif; }
html, body { margin:0; background:#cfd6dc; }
body { font:9pt/1.4 var(--body); color:var(--ink); counter-reset: pg; }
.page { width:297mm; height:210mm; background:#fff; padding:11mm 13mm 10mm; position:relative; overflow:hidden; page-break-after:always; display:flex; flex-direction:column; gap:4mm; counter-increment: pg; }
.page:last-child { page-break-after:auto; }
@media screen { body { padding:8mm 0; } .page { margin:0 auto 8mm; } }
h1,h2,h3,h4 { font-family:var(--display); margin:0; color:var(--navy); line-height:1.15; text-wrap:balance; }
h2 { font-size:17pt; font-weight:600; letter-spacing:-.01em; }
h4 { font-size:10pt; font-weight:600; }
.eyebrow { font:600 7pt var(--body); letter-spacing:.14em; text-transform:uppercase; color:var(--teal); margin-bottom:1mm; }
.ph { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid var(--navy); padding-bottom:2.5mm; }
.phr { text-align:right; display:flex; flex-direction:column; font-size:8pt; color:var(--ink-3); }
.phr b { font:600 9.5pt var(--display); color:var(--navy); }
.pf { position:absolute; left:13mm; right:13mm; bottom:5mm; display:flex; justify-content:space-between; font-size:7pt; color:var(--ink-3); }
.pn::after { content: "Page " counter(pg); }
.lede { font-size:9.5pt; color:var(--ink-2); max-width:230mm; }
.soft { font-weight:400; color:var(--ink-3); font-family:var(--body); font-size:8.5pt; }

/* cover */
.cover { background:var(--navy); color:#fff; padding:16mm 18mm; justify-content:space-between; }
.cover::before { content:""; position:absolute; right:-60mm; top:-50mm; width:200mm; height:200mm; border-radius:50%; background:radial-gradient(closest-side, rgba(47,120,159,.5), transparent); }
.brand { display:flex; align-items:center; gap:10px; font:600 16pt var(--display); color:#fff; position:relative; }
.brand .by { font-weight:400; color:#9fbcd0; font-size:12pt; }
.mark { width:34px; height:34px; border-radius:10px; background:linear-gradient(140deg,#3d8fba,#1d6189); display:grid; place-items:center; }
.mark svg { width:58%; height:58%; }
.ctext { position:relative; max-width:190mm; display:flex; flex-direction:column; gap:4mm; }
.cover h1 { color:#fff; font-size:32pt; font-weight:600; letter-spacing:-.02em; }
.ctext p { color:#c6d9e6; font-size:12pt; max-width:170mm; }
.cfacts { display:grid; grid-template-columns:repeat(4,1fr); gap:5mm; position:relative; }
.cfacts div { border-top:1px solid rgba(255,255,255,.25); padding-top:3mm; display:flex; flex-direction:column; gap:1mm; }
.cfacts span { font:600 7.5pt var(--body); letter-spacing:.1em; text-transform:uppercase; color:#9fbcd0; }
.cfacts b { font:600 15pt var(--display); color:#fff; }
.cfacts .hot b { color:#f6b27f; }
.cfacts .hot { border-top-color:#f6b27f; }
.cfoot { display:flex; justify-content:space-between; font-size:8.5pt; color:#9fbcd0; position:relative; }

/* shared track pieces */
.gtrack, .otrack { position:relative; flex:1; }
.wk { position:absolute; top:0; bottom:0; border-left:1px solid #eef1f4; }
.wk.hol { background:repeating-linear-gradient(135deg, rgba(14,49,71,.055) 0 3px, transparent 3px 6px); }

/* Gantt */
.gantt { display:flex; flex-direction:column; border:1px solid var(--line); border-radius:6px; overflow:hidden; }
.ghead { display:flex; background:var(--navy); color:#fff; }
.ghead .glab { color:#fff; font-weight:600; font-size:7.5pt; align-items:flex-end; padding-bottom:1.2mm; border-right:1px solid rgba(255,255,255,.15); }
.ghead .gtrack { height:12mm; }
.months { position:absolute; left:0; right:0; top:0; height:4.3mm; border-bottom:1px solid rgba(255,255,255,.15); }
.mon { position:absolute; top:0; height:100%; padding-left:4px; font:600 7.2pt var(--body); line-height:4.3mm; border-left:1px solid rgba(255,255,255,.2); white-space:nowrap; overflow:hidden; }
.weeks { position:absolute; left:0; right:0; top:4.3mm; bottom:0; }
.wkh { position:absolute; top:0; bottom:0; overflow:hidden; text-align:center; font-size:5.6pt; color:#b9cfdd; line-height:1.15; padding-top:.6mm; border-left:1px solid rgba(255,255,255,.1); }
.wkh b { display:block; font-size:6.6pt; color:#fff; }
.wkh.hol { background:#2c5670; }
.glab { width:120mm; flex:none; display:flex; justify-content:space-between; align-items:center; gap:2mm; padding:0 2mm 0 2.2mm; }
.row { display:flex; height:4.62mm; border-top:1px solid #f0f3f6; }
.row .glab { font-size:6.9pt; }
.tn { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tn em { font-style:normal; color:var(--ink-3); display:inline-block; width:5mm; font-size:6.3pt; }
.who { width:25mm; flex:none; display:flex; align-items:center; gap:4px; color:var(--ink-2); font-size:6.4pt; white-space:nowrap; }
.who i { width:6px; height:6px; border-radius:2px; flex:none; }
.row.ms .tn { font-weight:600; color:var(--navy); }
.wsh { background:var(--b50); height:4.8mm; }
.wsh .glab { font:600 7.4pt var(--display); color:var(--navy); }
.barx { position:absolute; top:1mm; bottom:1mm; margin-left:1px; border-radius:2.5px; background:var(--c); }
.barx.cont { background:repeating-linear-gradient(135deg, var(--c) 0 2.5px, #fff 2.5px 5px); box-shadow:inset 0 0 0 1px var(--c); }
.dia { position:absolute; top:50%; width:7px; height:7px; background:var(--navy); transform:translate(-50%,-50%) rotate(45deg); }
.dia.live { background:var(--good); width:9px; height:9px; }
.mslbl { position:absolute; top:50%; transform:translateY(-50%); font-size:5.8pt; color:var(--ink-2); white-space:nowrap; }
.legend { display:flex; flex-wrap:wrap; gap:2mm 4.5mm; font-size:7pt; color:var(--ink-2); align-items:center; }
.legend span { display:inline-flex; align-items:center; gap:4px; }
.legend i { width:14px; height:7px; border-radius:2px; display:inline-block; }
.legend i.hatch { background:repeating-linear-gradient(135deg,#1baf7a 0 2.5px,#fff 2.5px 5px); box-shadow:inset 0 0 0 1px #1baf7a; }
.legend i.dlg { width:7px; height:7px; background:var(--navy); transform:rotate(45deg); border-radius:0; margin:0 3px; }
.legend i.holg { background:repeating-linear-gradient(135deg, rgba(14,49,71,.25) 0 2px, transparent 2px 4px); box-shadow:inset 0 0 0 1px #dfe5ea; }

/* one page overview */
.onepage { display:flex; flex-direction:column; border:1px solid var(--line); border-radius:6px; overflow:hidden; }
.ohead { display:flex; background:var(--navy); color:#fff; }
.otrack.head { height:12mm; }
.olab { width:62mm; flex:none; display:flex; align-items:center; gap:2.5mm; padding:0 3mm; font:600 8.5pt var(--display); color:var(--navy); }
.olab b { width:5mm; height:5mm; border-radius:50%; background:var(--b100); color:var(--teal-d); display:grid; place-items:center; font-size:7pt; flex:none; }
.orow { display:flex; height:10mm; border-top:1px solid var(--line); }
.span { position:absolute; top:2.3mm; bottom:2.3mm; border-radius:4px; background:var(--b50); box-shadow:inset 0 0 0 1px var(--b100); }
.seg { position:absolute; top:3.5mm; bottom:3.5mm; margin-left:1px; border-radius:2px; opacity:.85; }
.msrow { height:12mm; background:#fbfcfd; }
.odot { position:absolute; top:50%; transform:translateY(-50%); width:16px; height:16px; border-radius:50%; background:var(--navy); color:#fff; font:700 7pt var(--body); display:grid; place-items:center; box-shadow:0 0 0 2px #fff; }
.odot.live { background:var(--good); }
.omsgrid { display:grid; grid-template-columns:repeat(4,1fr); gap:1.6mm 5mm; }
.oml { display:grid; grid-template-columns:5.5mm 17mm 1fr; align-items:baseline; font-size:7.6pt; }
.oml b { width:4.6mm; height:4.6mm; border-radius:50%; background:var(--navy); color:#fff; display:grid; place-items:center; font-size:6.4pt; }
.oml.live b { background:var(--good); }
.oml span { color:var(--ink-3); }
.oml em { font-style:normal; color:var(--ink); }
.oml.live em { font-weight:700; color:var(--good); }
.onote { display:flex; justify-content:space-between; gap:5mm; align-items:center; font-size:7.3pt; color:var(--ink-3); margin-top:auto; margin-bottom:5mm; }

/* modules */
.mods { display:grid; grid-template-columns:1fr 1fr; gap:4mm 6mm; align-content:start; }
.mod { border:1px solid var(--line); border-radius:8px; overflow:hidden; }
.modh { display:flex; gap:3mm; align-items:center; padding:2.4mm 3mm; background:var(--b50); }
.mid { font:700 9pt var(--display); color:#fff; background:#eb6834; border-radius:5px; padding:1mm 2mm; min-width:9mm; text-align:center; }
.modh b { display:block; font:600 9.5pt var(--display); color:var(--navy); }
.modh span { font-size:7.3pt; color:var(--ink-2); }
.mt { width:100%; border-collapse:collapse; font-size:7.1pt; }
.mt th { text-align:left; font-weight:600; color:var(--ink-3); text-transform:uppercase; letter-spacing:.06em; font-size:6pt; padding:1.2mm 2.5mm; border-bottom:1px solid var(--line); }
.mt td { padding:1.3mm 2.5mm; border-bottom:1px solid #f0f3f6; vertical-align:top; color:var(--ink-2); }
.mt tr:last-child td { border-bottom:0; }
.mt .c1 { font-weight:600; color:var(--ink); width:24%; }
.mt .c3 { width:32%; }

/* tables */
.tbl { width:100%; border-collapse:collapse; font-size:8.3pt; }
.tbl th { text-align:left; font:600 6.8pt var(--body); text-transform:uppercase; letter-spacing:.08em; color:var(--ink-3); padding:2mm 2.5mm; border-bottom:1.5px solid var(--navy); }
.tbl td { padding:1.8mm 2.5mm; border-bottom:1px solid var(--line); vertical-align:top; }
.tbl .d { white-space:nowrap; font-weight:600; color:var(--navy); width:30mm; }
.tbl .w { color:var(--ink-3); width:12mm; }
.tbl .n { color:var(--ink-2); }
.tbl tr.golive td { background:#e5f5ee; }
.tbl tr.golive b { color:#1d7a55; }

/* roles */
.roles { display:grid; grid-template-columns:repeat(4,1fr); gap:4mm; align-content:start; }
.role { background:var(--canvas); border-radius:8px; padding:3mm 3.5mm; }
.role.lead { grid-column:span 2; grid-row:span 2; background:var(--navy); }
.role.lead h4 { color:#fff; font-size:11pt; }
.role.lead ul { color:#d4e3ec; font-size:8.4pt; }
.role h4 { display:flex; gap:6px; align-items:center; margin-bottom:1.5mm; }
.role h4 i { width:8px; height:8px; border-radius:2px; flex:none; }
.role ul { margin:0; padding-left:4mm; color:var(--ink-2); font-size:7.6pt; display:grid; gap:1mm; }
.racigrid { display:grid; grid-template-columns:1.65fr 1fr; gap:7mm; align-items:start; }
.raci { width:100%; border-collapse:collapse; font-size:7.8pt; }
.raci th { font:600 6.5pt var(--body); text-transform:uppercase; letter-spacing:.05em; color:var(--ink-3); padding:1.8mm 1.2mm; border-bottom:1.5px solid var(--navy); text-align:center; }
.raci td { text-align:center; padding:1.55mm 1.2mm; border-bottom:1px solid var(--line); color:var(--ink-3); }
.raci .rl { text-align:left; color:var(--ink); font-weight:500; }
.raci td.a { background:#dce9f9; color:var(--navy); font-weight:700; }
.raci td.r { color:var(--ink); font-weight:700; }
.rules { background:var(--canvas); border-radius:8px; padding:4mm 5mm; display:flex; flex-direction:column; gap:2mm; }
.rules ol { margin:0; padding-left:4.5mm; display:grid; gap:2mm; color:var(--ink-2); font-size:8.3pt; }
.key { font-size:7.6pt; color:var(--ink-3); border-top:1px solid var(--line); padding-top:2mm; }

/* risks */
.riskgrid { display:grid; grid-template-columns:1.7fr 1fr; gap:7mm; align-items:start; }
.risk td { font-size:7.9pt; padding:1.6mm 2.5mm; }
.lvl { font-weight:700; font-size:7.3pt; display:inline-flex; align-items:center; gap:4px; }
.lvl::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
.lvl.High { color:var(--bad); } .lvl.Medium { color:#c8582c; } .lvl.Low { color:var(--good); }
.dec { background:var(--navy); border-radius:8px; padding:5mm; }
.dec h4 { color:#fff; margin-bottom:3mm; }
.dec ol { margin:0; padding-left:4.5mm; display:grid; gap:2.4mm; color:#d4e3ec; font-size:8.5pt; }

/* last page */
.last { display:grid; grid-template-columns:1.5fr 1fr; gap:8mm; align-items:start; }
.tgs { display:grid; grid-template-columns:1fr 1fr; gap:2.5mm 5mm; margin-top:2.5mm; }
.tg { border-left:3px solid var(--teal); padding-left:3mm; }
.tg span { font:600 6.8pt var(--body); letter-spacing:.08em; text-transform:uppercase; color:var(--teal); }
.tg p { margin:0; font-size:8.3pt; }
.asm { margin:2.5mm 0 0; padding-left:4.5mm; display:grid; gap:1.3mm; color:var(--ink-2); font-size:8pt; }
.hol { margin-top:2.5mm; }
.hol td { padding:1.4mm 2.5mm; font-size:8pt; }
.src { font-size:7.2pt; color:var(--ink-3); margin-top:2mm; }
"""

doc = f'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Kynex by QI Spine · Launch plan · Gantt report</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body>{"".join(pages)}</body></html>'''
OUT_HTML.write_text(doc, encoding="utf-8")
subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=15000",
                f"--print-to-pdf={OUT_PDF}", OUT_HTML.as_uri()], check=True, capture_output=True)
print("wrote", OUT_PDF, "pages:", len(pages))
