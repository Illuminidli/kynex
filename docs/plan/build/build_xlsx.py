"""Builds docs/plan/Kynex-Launch-Plan.xlsx from plan_data."""
import pathlib

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from plan_data import build

P = build()
OUT = pathlib.Path(__file__).resolve().parent.parent / "Kynex-Launch-Plan.xlsx"

NAVY = "0E3147"
INK = "0B0B0B"
MUTED = "52514E"
GRID = "E1E0D9"
HOL = "EFEEEA"
WS_FILL = "EAF2F8"
F = lambda c: PatternFill("solid", fgColor=c)
thin = Side(style="thin", color=GRID)
B = Border(left=thin, right=thin, top=thin, bottom=thin)
H = lambda c: c.lstrip("#").upper()

wb = Workbook()


def title(ws, text, sub, width):
    ws["A1"] = text
    ws["A1"].font = Font(size=18, bold=True, color=NAVY)
    ws["A2"] = sub
    ws["A2"].font = Font(size=11, color=MUTED)
    ws.sheet_view.showGridLines = False


def table(ws, row, headers, rows, widths, wrap_cols=()):
    for i, h in enumerate(headers, 1):
        c = ws.cell(row, i, h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = F(NAVY)
        c.alignment = Alignment(vertical="center", wrap_text=True)
        c.border = B
    for r, vals in enumerate(rows, row + 1):
        for i, v in enumerate(vals, 1):
            c = ws.cell(r, i, v)
            c.border = B
            c.alignment = Alignment(vertical="top", wrap_text=True)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    return row + len(rows) + 1


# ---------------- Gantt ----------------
g = wb.active
g.title = "Gantt"
title(g, P["title"], f"{P['subtitle']} · Kickoff {P['kickoffLabel']} · Go-live {P['goLiveLabel']} · Owner and single point of contact: Project Head · {P['version']}", 0)
FIRSTW = 7  # column G = W0
cols = ["#", "Workstream / task", "Responsible", "Accountable", "From", "To"]
widths = [5, 58, 20, 14, 9, 9]
for i, w in enumerate(widths, 1):
    g.column_dimensions[get_column_letter(i)].width = w

# Legend (row 3)
c = g.cell(3, 2, "Bar colour = team responsible · hatched = contingency · ◆ = milestone · grey/🎉 = holiday week (hover for name)")
c.font = Font(size=9, color=MUTED)
col = FIRSTW
for k, t in P["teams"].items():
    c = g.cell(3, col, t["name"])
    c.fill = F(H(t["color"]))
    c.font = Font(color="0B0B0B" if k == "it" else "FFFFFF", bold=True, size=9)
    c.alignment = Alignment(horizontal="center")
    g.merge_cells(start_row=3, start_column=col, end_row=3, end_column=col + 2)
    col += 3

# Week headers: row 4 month, row 5 week, row 6 date, row 7 holiday
HR = 4
for i, h in enumerate(cols, 1):
    c = g.cell(HR + 1, i, h)
    c.font = Font(bold=True, color="FFFFFF")
    c.fill = F(NAVY)
    c.border = B
    g.merge_cells(start_row=HR + 1, start_column=i, end_row=HR + 3, end_column=i)
    c.alignment = Alignment(vertical="center", horizontal="left" if i == 2 else "center", wrap_text=True)
prev = None
mstart = FIRSTW
for w in P["weeks"]:
    cc = FIRSTW + w["w"]
    g.column_dimensions[get_column_letter(cc)].width = 6.2
    if w["month"] != prev:
        if prev is not None and cc - 1 > mstart:
            g.merge_cells(start_row=HR, start_column=mstart, end_row=HR, end_column=cc - 1)
        g.cell(HR, cc, w["month"]).font = Font(bold=True, color=NAVY)
        mstart, prev = cc, w["month"]
    for r, v in ((HR + 1, w["label"]), (HR + 2, w["date"])):
        c = g.cell(r, cc, v)
        c.font = Font(bold=r == HR + 1, color="FFFFFF", size=9)
        c.fill = F("2F789F" if not (w["holidays"] or w["light"]) else "6E8FA3")
        c.alignment = Alignment(horizontal="center")
        c.border = B
    c = g.cell(HR + 3, cc, "🎉" if (w["holidays"] or w["light"]) else "")
    c.alignment = Alignment(horizontal="center")
    c.fill = F(HOL if (w["holidays"] or w["light"]) else "FFFFFF")
    c.border = B
    if w["holidays"] or w["light"]:
        from openpyxl.comments import Comment
        c.comment = Comment("; ".join(filter(None, [w["light"], *w["holidays"]])), "Plan")
g.merge_cells(start_row=HR, start_column=mstart, end_row=HR, end_column=FIRSTW + len(P["weeks"]) - 1)

row = HR + 4
n = 0
for wsx in P["workstreams"]:
    c = g.cell(row, 1, "")
    for i in range(1, FIRSTW + len(P["weeks"])):
        g.cell(row, i).fill = F(WS_FILL)
        g.cell(row, i).border = B
    g.cell(row, 2, wsx["name"]).font = Font(bold=True, color=NAVY, size=11)
    row += 1
    for t in wsx["tasks"]:
        n += 1
        team = P["teams"][t["team"]]
        ms = t["kind"] == "ms"
        vals = [n, ("◆ " if ms else "") + t["name"], "Project Head" if ms else team["name"], "Project Head",
                t["dateLabel"][4:10] if ms else t["from"], "" if ms else t["to"]]
        for i, v in enumerate(vals, 1):
            c = g.cell(row, i, v)
            c.border = B
            c.alignment = Alignment(vertical="center", wrap_text=i == 2, horizontal="left" if i == 2 else "center")
            c.font = Font(bold=ms, color=NAVY if ms else INK, size=10)
        if t["detail"]:
            from openpyxl.comments import Comment
            g.cell(row, 2).comment = Comment(t["detail"], "Plan")
        for w in P["weeks"]:
            cc = FIRSTW + w["w"]
            c = g.cell(row, cc)
            c.border = B
            if w["holidays"] or w["light"]:
                c.fill = F(HOL)
            if t["start"] <= w["w"] <= t["end"]:
                if ms:
                    c.value = "◆"
                    c.font = Font(bold=True, color=NAVY, size=13)
                    c.alignment = Alignment(horizontal="center", vertical="center")
                elif t.get("contingency"):
                    c.fill = PatternFill("lightUp", fgColor=H(team["color"]), bgColor="FFFFFF")
                else:
                    c.fill = F(H(team["color"]))
        row += 1
g.freeze_panes = g.cell(HR + 4, FIRSTW)
g.page_setup.orientation = "landscape"
g.page_setup.fitToWidth = 1
g.page_setup.fitToHeight = 0
g.sheet_properties.pageSetUpPr.fitToPage = True
g.print_title_rows = f"{HR}:{HR + 3}"

# ---------------- Build modules ----------------
bm = wb.create_sheet("Build modules")
title(bm, "Build modules in detail", "Every module takes 3 weeks: week 1 build, week 2 build and connect, week 3 test and polish. Track A and Track B run side by side. The Project Head accepts each module at its review.", 0)
rows = []
for m in P["modules"]:
    for i, c in enumerate(m["components"]):
        rows.append((f"{m['id']} · {m['name']}" if i == 0 else "", m["track"] if i == 0 else "",
                     f"W{m['start']}-W{m['end']} ({m['from']} - {m['to']})" if i == 0 else "", c["name"], c["what"], c["done"]))
table(bm, 4, ["Module", "Track", "When", "Component", "What it includes", "Done when"], rows, [34, 15, 24, 28, 70, 50])
r0 = 5
for m in P["modules"]:
    n = len(m["components"])
    for rr in range(r0, r0 + n):
        for cc in range(1, 7):
            bm.cell(rr, cc).fill = F("F4F8FB" if P["modules"].index(m) % 2 == 0 else "FFFFFF")
    bm.cell(r0, 1).font = Font(bold=True, color=NAVY)
    r0 += n
for rr in range(5, 5 + len(rows)):
    longest = max(len(str(bm.cell(rr, 5).value or "")) / 68, len(str(bm.cell(rr, 6).value or "")) / 48, len(str(bm.cell(rr, 1).value or "")) / 32)
    bm.row_dimensions[rr].height = 16 * max(1, int(longest) + 1) + 4
bm.freeze_panes = "A5"

# ---------------- Roles ----------------
r = wb.create_sheet("Roles")
title(r, "Who does what", "The Project Head leads and is accountable for everything. Each team delivers inside the Project Head's plan, specs and reviews.", 0)
rows = [(x["title"], "\n".join("• " + d for d in x["duties"])) for x in P["roles"]]
table(r, 4, ["Role", "Responsibilities"], rows, [40, 110])
for i, x in enumerate(P["roles"], 5):
    r.cell(i, 1).font = Font(bold=True, color=H(P["teams"][x["team"]]["color"]) if x["team"] != "it" else "8A5E00")
    r.row_dimensions[i].height = 16 * len(x["duties"]) + 6
rr = 6 + len(rows)
r.cell(rr, 1, "How the team works").font = Font(bold=True, size=13, color=NAVY)
rules = [
    "All work enters through the Project Head's backlog. Nobody changes scope, design or priorities without the Project Head's approval.",
    "2-week sprints: the Project Head plans each sprint, the team delivers, and the Project Head reviews and accepts the work.",
    "Done means built, tested by QA, checked by a physio where it's clinical, and approved by the Project Head.",
    "Only the Project Head reports to management: the Friday update, the monthly demo and decisions.",
    "Code, cloud, stores and data stay in company accounts, with the Project Head as admin. Every release goes through the Project Head.",
]
for i, t in enumerate(rules, rr + 1):
    c = r.cell(i, 1, f"{i - rr}. {t}")
    r.merge_cells(start_row=i, start_column=1, end_row=i, end_column=2)
    c.alignment = Alignment(wrap_text=True)

# ---------------- RACI ----------------
x = wb.create_sheet("RACI")
title(x, "Responsibility chart (RACI)", "R = does the work · A = accountable, final sign-off · C = consulted · I = kept informed", 0)
table(x, 4, ["Workstream", *P["raciRoles"]], P["raci"], [40] + [13] * len(P["raciRoles"]))
for rr in range(5, 5 + len(P["raci"])):
    for cc in range(2, 2 + len(P["raciRoles"])):
        c = x.cell(rr, cc)
        c.alignment = Alignment(horizontal="center", vertical="center")
        if "A" in str(c.value):
            c.fill = F("D6E6F8")
            c.font = Font(bold=True, color=NAVY)
        elif c.value == "R":
            c.font = Font(bold=True)

# ---------------- Milestones ----------------
m = wb.create_sheet("Milestones")
title(m, "Milestones & demos", "Dates management will see working. Each one is signed off by the Project Head.", 0)
ms = sorted([t for w in P["workstreams"] for t in w["tasks"] if t["kind"] == "ms"], key=lambda t: t["date"])
table(m, 4, ["Date", "Week", "Milestone", "Notes"], [(t["dateLabel"], f"W{t['start']}", t["name"], t["detail"]) for t in ms], [18, 7, 50, 70])

# ---------------- Risks & decisions ----------------
k = wb.create_sheet("Risks & decisions")
title(k, "Top risks & decisions needed from management", "The Project Head owns every risk and reviews them every week.", 0)
end = table(k, 4, ["Risk", "Level", "Mitigation"], [(z["risk"], z["level"], z["mitigation"]) for z in P["risks"]], [50, 10, 90])
lvl = {"High": "D03B3B", "Medium": "EC835A", "Low": "0CA30C"}
for i, z in enumerate(P["risks"], 5):
    k.cell(i, 2).font = Font(bold=True, color=lvl[z["level"]])
k.cell(end + 1, 1, "Decisions needed from management in week 1").font = Font(bold=True, size=13, color=NAVY)
for i, d in enumerate(P["decisions"], end + 2):
    c = k.cell(i, 1, f"{i - end - 1}. {d}")
    k.merge_cells(start_row=i, start_column=1, end_row=i, end_column=3)

# ---------------- Success targets ----------------
s = wb.create_sheet("Success targets")
title(s, "Launch success targets (proposed)", "To be confirmed with management in week 1", 0)
table(s, 4, ["Area", "Target"], [(z["area"], z["target"]) for z in P["targets"]], [20, 100])

# ---------------- Holidays & assumptions ----------------
h = wb.create_sheet("Holidays & assumptions")
title(h, "Holidays & planning assumptions", "Holiday dates from officeholidays.com. Eid depends on the moon. Regional holidays vary by state.", 0)
end = table(h, 4, ["Date", "Holiday"], [(z["label"], z["name"]) for z in P["holidays"]], [22, 60])
h.cell(end + 1, 1, "Assumptions").font = Font(bold=True, size=13, color=NAVY)
for i, a in enumerate(P["assumptions"], end + 2):
    h.cell(i, 1, f"• {a}")
    h.merge_cells(start_row=i, start_column=1, end_row=i, end_column=2)
    h.cell(i, 1).alignment = Alignment(wrap_text=True)
    h.row_dimensions[i].height = 30

for ws in wb.worksheets:
    ws.sheet_view.zoomScale = 90
wb.save(OUT)
print("wrote", OUT)
