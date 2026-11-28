"""Kynex by QI Spine: launch plan data. This is the single source for the Excel, Sheet, web page and slides.

v2 (28 Nov 2026): the team starts on Tue 1 Dec 2026 and go-live is Wed 31 Mar 2027.
- Engineering is built in 3-week modules on two parallel tracks.
- UX runs in three phases.
- Video is AI-first, with a physio shoot as a contingency.
"""
import datetime as dt
import json
import pathlib

START = dt.date(2026, 11, 23)  # Monday of week 0
WEEKS = 23  # W0..W22
KICKOFF = dt.date(2026, 12, 1)
GO_LIVE = dt.date(2027, 3, 31)
VERSION = "v2 · 28 Nov 2026"


def week_start(w: int) -> dt.date:
    return START + dt.timedelta(weeks=w)


def week_of(d: dt.date) -> int:
    return (d - START).days // 7


# Teams. "lead" is the project head. Colours come from the validated categorical palette (light mode).
TEAMS = {
    "lead": {"name": "Project Head", "color": "#2a78d6"},
    "dev": {"name": "Developers", "color": "#eb6834"},
    "physio": {"name": "Physio team", "color": "#1baf7a"},
    "it": {"name": "Company IT / Legal", "color": "#eda100"},
    "qa": {"name": "QA", "color": "#e87ba4"},
    "centres": {"name": "Centres & Management", "color": "#008300"},
    "ux": {"name": "UI/UX design", "color": "#6250d6"},
}

# Holidays that fall in the plan window (national, or observed widely across states).
HOLIDAYS = [
    (dt.date(2026, 12, 25), "Christmas"),
    (dt.date(2027, 1, 1), "New Year's Day"),
    (dt.date(2027, 1, 14), "Makar Sankranti / Pongal (14-15 Jan)"),
    (dt.date(2027, 1, 26), "Republic Day"),
    (dt.date(2027, 2, 19), "Shivaji Jayanti (Maharashtra)"),
    (dt.date(2027, 3, 6), "Maha Shivratri (Sat)"),
    (dt.date(2027, 3, 10), "Eid ul-Fitr (moon-dependent)"),
    (dt.date(2027, 3, 22), "Holi (22-23 Mar)"),
    (dt.date(2027, 3, 26), "Good Friday"),
    (dt.date(2027, 4, 7), "Gudi Padwa / Ugadi"),
    (dt.date(2027, 4, 14), "Ambedkar Jayanti / regional new years"),
    (dt.date(2027, 4, 15), "Ram Navami"),
]
LIGHT_WEEKS = {4: "Christmas week", 5: "New Year week", 17: "Holi + Good Friday week"}

# Workstreams -> tasks. Each task is (name, team, start_week, end_week, detail), or ("◆", name, date, detail) for a milestone.
D = dt.date
WORKSTREAMS = [
    ("1. Leadership & governance", [
        ("Present plan, project charter & roles to management", "lead", 0, 1, "Approval names the Project Head as the single point of contact, with final say on scope, priorities and releases."),
        ("◆", "Kickoff: team starts", KICKOFF, "Tue 1 Dec 2026"),
        ("Week 1 discovery workshops", "lead", 1, 1, "Cover CRM, payment, video, cloud, the centre list, languages, patient data, helpdesk, reporting rhythm and the tracker app decision."),
        ("Team size & track set-up", "lead", 1, 2, "The Project Head decides how many developers go on each build track. That number sets the build speed."),
        ("Team onboarding & codebase walkthrough", "lead", 1, 2, "Each team member gets their role, the working rules and a walkthrough of the Kynex codebase."),
        ("Module planning & reviews (every 3 weeks)", "lead", 2, 15, "The Project Head sets each module's scope and accepts or rejects it at the module review."),
        ("Friday status update to management", "lead", 1, 22, "One page every Friday covering progress against the Gantt, risks and decisions needed."),
        ("◆", "Plan, charter & budget approved", D(2026, 12, 4), "Management signs off the plan, the Project Head charter and the cost list."),
        ("◆", "Demo 1: foundations + design direction", D(2026, 12, 23), "Shows Module 1 and the signed-off wireframes and design system."),
        ("◆", "Demo 2: patient app, doctor dashboard, bookings & payments", D(2027, 1, 15), "End of Modules 2 and 3."),
        ("◆", "Demo 3: consults, chat, outcome scores, pain report", D(2027, 2, 5), "End of Modules 4 and 5."),
        ("◆", "Demo 4: full app + feature freeze", D(2027, 2, 26), "End of Modules 6 and 7. No new features after this date."),
        ("◆", "Go / no-go decision", D(2027, 3, 19), "The Project Head and management decide, using the dry-run results."),
        ("◆", "Launch report + Phase 2 roadmap", D(2027, 4, 30), "Covers results against the success targets and the next phase."),
    ]),
    ("2. Product & UX design (3 phases)", [
        ("Phase 1 · User research: patients of all ages, physios, front desk", "ux", 1, 2, "Includes patients aged 60+ and people who are not comfortable with phones."),
        ("Phase 1 · Personas, user flows & wireframes for all 7 modules", "ux", 2, 4, "The structure is settled before developers build. The Project Head approves it."),
        ("Phase 1 · Design system: 'Kynex by QI Spine'", "ux", 3, 4, "Colours, type, components, large-text and accessibility rules."),
        ("◆", "Wireframes & design system signed off", D(2026, 12, 23), "Signed off by the Project Head."),
        ("Phase 2 · Screen design, one module ahead of development", "ux", 4, 11, "Final screens for each module are ready before that module starts."),
        ("Phase 2 · Usability test at the end of every module", "ux", 7, 13, "Includes 60+ and low-tech users. Success means they finish key tasks without help."),
        ("Phase 3 · Visual polish: motion, micro-interactions, empty and error states", "ux", 11, 16, "A longer, dedicated polish phase near the end. This is where the app becomes 'premium'."),
        ("Phase 3 · Accessibility audit & large-text pass", "ux", 13, 15, ""),
        ("Phase 3 · Final usability round at the dry-run centres", "ux", 15, 16, ""),
    ]),
    ("3. Core engineering · 3-week modules on 2 tracks", [
        ("Camera engine & AI: 100+ exercises, low-end Android speed", "lead", 2, 13, "The Project Head builds and owns this."),
        ("M1 · Foundations: cloud, sign-in, roles, consent, audit log, pipeline", "dev", 2, 4, "All developers. Week 3 of every module is for testing and polish. See the Build modules tab."),
        ("Track A · M2 · Patient app & core rehab loop", "dev", 5, 7, "Includes the New Year week (lighter)."),
        ("Track B · M3 · Doctor dashboard, plans, bookings & payments", "dev", 5, 7, ""),
        ("Track A · M4 · Care & communication: video consults, chat, reminders", "dev", 8, 10, ""),
        ("Track B · M5 · Clinical insights: outcome scores, 3D pain report, education", "dev", 8, 10, ""),
        ("Track A · M6 · Languages, AI voice coach, Android & iPhone apps", "dev", 11, 13, ""),
        ("Track B · M7 · Admin & analytics, CRM sync", "dev", 11, 13, ""),
        ("◆", "Feature freeze", D(2027, 2, 26), ""),
        ("Hardening: bug fixes, speed, security fixes, accessibility", "dev", 14, 15, ""),
        ("◆", "Release candidate", D(2027, 3, 12), "Accepted by the Project Head."),
    ]),
    ("4. Integrations & accounts", [
        ("CRM: access, field mapping, data contract", "it", 2, 5, "Company IT gives access. The Project Head approves the mapping. The build is in M7."),
        ("Payment gateway account (needed for M3)", "it", 2, 4, "Opened in the company's name."),
        ("WhatsApp Business & SMS accounts (needed for M4)", "it", 2, 6, "WhatsApp verification can take several weeks."),
        ("Video consult service account (needed for M4)", "it", 3, 6, ""),
        ("Patient data import (if week 1 decides yes)", "dev", 12, 15, ""),
    ]),
    ("5. Clinical content & exercise videos", [
        ("QI Spine exercise database handover (100+ exercises)", "physio", 1, 3, "Everything downstream depends on this."),
        ("◆", "Exercise list received", D(2026, 12, 18), ""),
        ("Exercise rules & rep-count criteria, per exercise", "physio", 3, 11, "Written with the Project Head, who encodes them in the camera engine."),
        ("Outcome questionnaires chosen (pain, function)", "physio", 4, 6, "Needed for M5."),
        ("AI video pilot: 10 exercises, physio review", "lead", 5, 6, "The preferred route is AI-generated videos."),
        ("◆", "Video route decided: AI, or physio shoot", D(2027, 1, 8), "Based on the pilot."),
        ("AI instructor videos for all exercises + physio review", "physio", 7, 13, "The planned route."),
        ("Contingency · Physio video shoot, 100+ exercises", "physio", 7, 11, "Only if AI is not approved. About 15 exercises per shoot day, so 7-8 shoot days spread over 5 weeks."),
        ("Contingency · Video editing, captions, upload", "dev", 8, 13, "Only if the physio shoot is used."),
        ("Education content (articles, short videos)", "physio", 6, 10, "Needed for M5."),
        ("Clinical acceptance testing", "physio", 13, 15, ""),
    ]),
    ("6. Languages (EN, HI + 10-15 regional)", [
        ("Language list confirmed (where the centres are)", "lead", 1, 1, ""),
        ("AI translation of app text & exercise cues", "lead", 9, 11, "Ready for M6."),
        ("Native-speaker review (physios / centre staff)", "physio", 10, 14, ""),
        ("Voice cues recorded in every language", "lead", 11, 14, "The cues for centre-region languages are done first."),
    ]),
    ("7. Mobile apps & stores", [
        ("Google Play & Apple developer accounts (company name)", "it", 2, 3, "The Project Head has admin access."),
        ("Internal test builds (Play internal, TestFlight)", "qa", 12, 14, ""),
        ("◆", "Submitted to both app stores", D(2027, 2, 26), ""),
        ("Store review & fixes (buffer)", "dev", 14, 16, ""),
        ("◆", "Live on Play Store & App Store", D(2027, 3, 19), "Released before Holi."),
    ]),
    ("8. Quality & compliance", [
        ("Test plan & device lab (low-end Android)", "qa", 2, 4, ""),
        ("Module testing (week 3 of every module)", "qa", 4, 13, ""),
        ("Full regression", "qa", 14, 15, ""),
        ("Legal review: DPDP, consent, privacy policy, terms", "it", 2, 8, "Company Legal decides. The Project Head supplies the data flows."),
        ("Security review & penetration test", "it", 13, 15, ""),
        ("◆", "Legal & security sign-off", D(2027, 3, 12), ""),
    ]),
    ("9. Launch & rollout", [
        ("Helpdesk set up (team chosen in week 1)", "centres", 13, 16, ""),
        ("Training material & how-to videos", "lead", 12, 14, ""),
        ("Dry run at 1-2 centres", "centres", 15, 16, "8-19 Mar. QA monitors."),
        ("Staff training at every centre", "centres", 15, 17, ""),
        ("Holi / Good Friday week: buffer only, no changes", "centres", 17, 17, ""),
        ("◆", "GO-LIVE: all QI Spine centres", GO_LIVE, ""),
        ("Hypercare: fast fixes, daily report to management", "lead", 18, 22, "4 weeks after go-live."),
        ("Phase 2 planning", "lead", 21, 22, ""),
    ]),
]

# Build modules in detail. Every module is 3 weeks: week 1 build, week 2 build and connect, week 3 test and polish.
MODULES = [
    ("M1", "Foundations", "All developers", 2, 4, [
        ("Cloud & environments", "India-region hosting on the company cloud. Development, test and live environments. Daily backups, monitoring and alerts.", "The app runs on the company cloud, and a backup restore has been tested."),
        ("Release pipeline", "Automatic tests and build on every change. Releases need the Project Head's approval.", "No release can go out without passing tests and the Project Head's sign-off."),
        ("Sign-in & accounts", "Patients sign in with their mobile number and a one-time code. Staff sign in with email and a second step. Roles: patient, physio/doctor, centre admin, management. Lockout and session timeout.", "Every role sees only what it should. Tested on low-end phones."),
        ("Consent & privacy", "Consent screens, the privacy notice, and requests to download or delete data. Wording comes from Company Legal.", "Legal has approved the wording, and consent is recorded per patient."),
        ("Audit log", "A record of who did what, and when, for every clinical change.", "Every plan change and review shows who made it and when."),
        ("Design system in code", "Shared buttons, cards, forms and charts from the UX design system, with large-text and accessibility settings.", "Every screen uses the shared parts, and large text never breaks a layout."),
    ]),
    ("M2", "Patient app & core rehab loop", "Track A", 5, 7, [
        ("Onboarding", "Welcome screens, language choice, a phone placement check, camera permission and a first-session tutorial.", "A first-time user aged 60+ reaches their first exercise without help."),
        ("Today screen", "Today's exercises, start or continue the session, streak, next visit and the care team.", "One tap from opening the app to starting the session."),
        ("Guided session", "Pain check-in and red-flag questions, camera counting with voice, tap-to-count fallback, rest timers, 'how did it feel', and pain after.", "A full session finishes without help, and a red flag stops it and alerts the clinic."),
        ("Camera engine (Project Head)", "Rep counting, holds and form tips for 100+ exercises. Runs on the phone, so no video is uploaded.", "Counts match a physio's count in lab tests, and it runs smoothly on a low-end Android phone."),
        ("Exercise player", "Instructor video, steps, precautions and where to place the phone.", "Every exercise has a video, or a clear placeholder."),
        ("Reports & progress", "Session report, replay of a rep, and progress over the weeks.", "The patient can see their progress over the past weeks."),
    ]),
    ("M3", "Doctor dashboard, plans, bookings & payments", "Track B", 5, 7, [
        ("Patient list & attention flags", "Patients sorted by urgency: red flags, rising pain, missed sessions, form problems, reports to review.", "A doctor finds who needs attention in under 10 seconds."),
        ("Plan builder", "Exercise library search, dose, days, notes, and templates per condition.", "A doctor prescribes a plan in under 2 minutes."),
        ("Session review", "Movement replay, rep timeline, notes, and 'mark as reviewed'.", "The doctor's note reaches the patient straight away."),
        ("Bookings & calendar", "Centre and video slots, doctor hours and leave, waiting list, booking reminders.", "A patient books, moves or cancels a visit without calling the centre."),
        ("Payments", "Pay for visits and packages through the payment gateway, with receipts. Refunds are done by an admin.", "Test payments, receipts and refunds work end to end."),
    ]),
    ("M4", "Care & communication", "Track A", 8, 10, [
        ("Video consults", "Join from the app or dashboard through a ready-made video service, with a waiting room and notes after the call.", "A 15-minute call holds up on a 4G connection."),
        ("Care-team chat", "Patient-to-physio messages and photos, quick replies, office hours, and escalation to the doctor.", "Messages arrive within seconds, and office hours are shown clearly."),
        ("Reminders", "Push notifications plus WhatsApp and SMS for sessions, visits and missed sessions.", "Reminders reach patients in their own language and at the right time."),
        ("Symptoms & red-flag alerts", "The patient reports a symptom and the clinic is alerted, with a log of the follow-up.", "Every red flag reaches the clinic within a minute."),
    ]),
    ("M5", "Clinical insights", "Track B", 8, 10, [
        ("Outcome scores", "Standard pain and function questionnaires, scheduled automatically, with scores shown over time.", "The doctor sees the score trend on the patient page."),
        ("3D pain map & body report", "The patient marks pain areas on a 3D body. The report is shared with the doctor.", "Pain areas are saved and shown over time."),
        ("Education library", "Articles and short videos for each condition, assigned along with the plan.", "Content is assigned automatically by condition."),
        ("Adherence & recovery trends", "Charts of sessions done, range of movement and pain over time, for the doctor.", "Every chart also has a table view."),
    ]),
    ("M6", "Languages, AI voice coach & mobile apps", "Track A", 11, 13, [
        ("Translation system", "All app text in English, Hindi and 10-15 regional languages, with a language switch.", "Every screen is checked in every language, with no cut-off text."),
        ("AI voice coach", "Spoken counts, cues and form tips in every language.", "A native speaker has approved the voice for each language."),
        ("Android & iPhone apps", "The Kynex web app wrapped as store apps, with camera and notification permissions, store listings and screenshots.", "The apps pass Play Store and App Store review."),
        ("Weak-internet sessions", "A session keeps working on a weak connection and syncs later.", "A session done in airplane mode syncs once the phone is back online."),
    ]),
    ("M7", "Admin & analytics, CRM sync", "Track B", 11, 13, [
        ("Management dashboard", "Centres, active patients, adherence, outcomes and revenue, as a live view.", "The numbers match the source data for a test week."),
        ("Centre admin", "Staff accounts, centre settings, and managing the exercise library.", "A centre is set up in under 30 minutes."),
        ("CRM sync", "Patients and appointments flow to and from the CRM.", "No duplicates or lost records over a 2-week test."),
        ("Activity & exports", "An activity feed, the audit view, and exports for management.", "An export opens cleanly in Excel."),
    ]),
    ("H", "Hardening", "All developers", 14, 15, [
        ("Speed & stability", "App start time, camera frame rate on low-end phones, and crash fixes.", "99.5% of sessions crash-free in the dry run."),
        ("Security fixes", "Fixes for the issues found in the penetration test.", "No high-severity issues remain open."),
        ("Accessibility", "Fixes from the UX accessibility audit.", "Every key task works with large text and a screen reader."),
    ]),
]

ROLES = [
    ("Project Head: product manager & core builder", "lead",
     ["Only point of contact between the project and management",
      "Owns the vision, roadmap, scope and priorities. Every change request comes through the Project Head.",
      "Decides the team size and how developers are split across the two build tracks",
      "Writes the specs and acceptance criteria for every module",
      "Builds and owns the camera engine, the AI and the architecture",
      "Approves every design, code merge, content item and release",
      "Runs module planning and reviews, the Friday updates and the demos",
      "Has admin access to every company account (cloud, stores, repository, payments)"]),
    ("Management (sponsor)", "centres",
     ["Approves the plan, the budget and the team allocation",
      "Unblocks access to other departments (IT, Legal, centres)",
      "Attends the demos and takes the go/no-go decision with the Project Head"]),
    ("UI/UX designer", "ux",
     ["Phase 1: research, user flows, wireframes and the 'Kynex by QI Spine' design system",
      "Phase 2: final screens, one module ahead of development, and a usability test after each module",
      "Phase 3: visual polish, motion, accessibility and the final usability round",
      "Works from the Project Head's specs and to the Project Head's sign-off"]),
    ("Developers (2 build tracks)", "dev",
     ["Build each 3-week module from the Project Head's specs, in the Kynex codebase",
      "Track A builds the patient app, care and communication, languages and the mobile apps",
      "Track B builds the doctor dashboard, bookings, payments, clinical insights, admin and the CRM",
      "Follow the Project Head's code review and release process"]),
    ("Physio team (2-3, 1-2 days a week)", "physio",
     ["Hand over the QI Spine exercise database (100+ exercises)",
      "Define the rules and form criteria for each exercise",
      "Review the AI instructor videos, or do the physio shoot if it's needed",
      "Choose the outcome measures, write the education content, and review clinical text in each language",
      "Run the clinical acceptance tests"]),
    ("QA", "qa",
     ["Write the test plan and run the low-end Android device lab",
      "Test in week 3 of every module, then run the full regression and the release checks",
      "Monitor the dry run"]),
    ("Company IT & Legal", "it",
     ["Set up the cloud, store, payment, WhatsApp and video accounts in the company's name, with the Project Head as admin",
      "Provide CRM access and the security test",
      "Legal: DPDP, consent, privacy policy, terms and any medical-device question"]),
    ("Centre staff", "centres",
     ["Take part in the dry run and the training",
      "Onboard patients and give first-line support"]),
]

RACI_ROLES = ["Project Head", "Management", "UI/UX", "Developers", "Physio", "QA", "IT / Legal", "Centres"]
RACI = [
    ("Vision, roadmap, scope & priorities", "A/R", "C", "C", "I", "C", "I", "I", "I"),
    ("Team size & build tracks", "A/R", "C", "-", "C", "-", "-", "-", "-"),
    ("Reporting to management", "A/R", "I", "-", "-", "-", "-", "-", "-"),
    ("UX research, design & polish", "A", "I", "R", "C", "C", "-", "-", "C"),
    ("Camera engine & AI", "A/R", "I", "C", "C", "C", "C", "-", "-"),
    ("Build modules M1-M7", "A", "I", "C", "R", "C", "C", "-", "-"),
    ("Integrations & accounts", "A", "I", "-", "R", "-", "C", "R", "-"),
    ("Clinical content & exercise videos", "A", "I", "C", "C", "R", "-", "-", "-"),
    ("Languages & voice", "A/R", "I", "C", "C", "R", "C", "-", "C"),
    ("Mobile apps & store release", "A/R", "I", "C", "R", "-", "C", "C", "-"),
    ("Testing & quality", "A", "I", "C", "C", "C", "R", "-", "-"),
    ("Legal, privacy & security", "A", "I", "-", "C", "-", "-", "R", "-"),
    ("Dry run, training & rollout", "A/R", "C", "-", "C", "C", "C", "-", "R"),
    ("Go / no-go & release", "A/R", "C", "-", "C", "C", "C", "C", "I"),
    ("Hypercare & helpdesk", "A", "I", "-", "R", "C", "R", "-", "R"),
]

RISKS = [
    ("Two build tracks need enough developers", "High",
     "About 2 developers per track. The Project Head sets the team size in week 1. With fewer developers, modules run one after another and the go-live date is reviewed at Demo 2."),
    ("Very large scope for 18 weeks", "High",
     "3-week modules with a test week each, feature freeze on 26 Feb, a follow-up release lane, and a weekly scope review by the Project Head"),
    ("Shared team members get pulled onto other work", "High",
     "Management names each person and their % time in week 1, committed until 30 Apr"),
    ("QI Spine exercise database arrives late", "High",
     "Needed by 18 Dec. The Project Head escalates to management if it slips."),
    ("AI videos not approved for 100+ exercises", "Medium",
     "A 10-exercise pilot and a decision by 8 Jan. A physio shoot (7-8 days over 5 weeks) is kept as the backup."),
    ("Delays opening WhatsApp, payment, video and CRM access", "Medium",
     "Applications go in during week 2, before the modules that need them. Company IT owns them."),
    ("Apple / Google review delays", "Medium",
     "Submit by 26 Feb, leaving 3 weeks of buffer. Patients can use the web app link either way."),
    ("Translation quality across 12-17 languages", "Medium",
     "AI translation plus native-speaker review. Centre-region languages are done first."),
    ("Camera speed on low-end Android phones", "Medium",
     "Device lab from week 2. The Project Head owns the engine."),
    ("Centre staff slow to adopt the app", "Medium",
     "Dry run, training at every centre, helpdesk and 4 weeks of hypercare"),
    ("Holiday weeks (Christmas, Sankranti, Holi/Good Friday)", "Low",
     "Already built into the plan. Holi week is buffer only."),
]

DECISIONS = [
    "Approve this plan and the Project Head charter: single point of contact, with final say on scope, priorities, team size and releases",
    "Name the team members and their % time, committed until 30 Apr 2027. About 4 developers allows two build tracks.",
    "Approve the budget (cost list presented in week 1)",
    "Name the contacts for IT/cloud, CRM and Legal",
    "Confirm the list of centres, which sets the regional languages",
    "Decide who staffs the patient helpdesk and whether current patients are imported",
    "Agree the reporting rhythm and whether to build a project tracker app",
]

TARGETS = [
    ("Centres live", "Every QI Spine centre is live on 31 Mar 2027"),
    ("Ease of use", "90%+ of usability-test users, including those aged 60+, finish key tasks without help"),
    ("Speed", "A patient is onboarded in under 3 minutes; a doctor prescribes a plan in under 2 minutes"),
    ("Adoption", "70% of new rehab patients at live centres are onboarded in the first 4 weeks"),
    ("Adherence", "60%+ of patients exercise at least 3 times a week"),
    ("Quality", "Crash-free sessions at 99.5% or above; app store rating of 4.5 or above"),
    ("Support", "Critical issues are fixed within 24 hours during hypercare"),
]

ASSUMPTIONS = [
    "The team starts on Tue 1 Dec 2026. Week 0 (this week) is for preparation and the pitch to management.",
    "Every build module takes 3 weeks: week 1 build, week 2 build and connect, week 3 test and polish",
    "Two build tracks run side by side and need about 4 developers. The Project Head decides the team size, and that sets the speed.",
    "Team: 1 UI/UX designer, 2-3 physios at 1-2 days a week and 1 QA, all on board by week 2",
    "UX works in three phases: structure first (research, flows, wireframes), screens one module ahead, then a long polish phase",
    "Exercise videos are AI-generated by preference. A physio shoot of 100+ exercises (7-8 shoot days over 5 weeks) is the backup.",
    "The phone apps wrap the existing Kynex web app; we are not writing separate native apps",
    "Chat, video consults, payments and WhatsApp use ready-made services rather than being built from scratch",
    "Languages: AI translation plus native-speaker review. Centre-region languages are done first.",
    "All accounts are owned by the company, with the Project Head as admin",
    "The success targets are proposals, to be confirmed with management in week 1",
]


def build() -> dict:
    weeks = []
    for w in range(WEEKS):
        s = week_start(w)
        hol = [n for d, n in HOLIDAYS if week_of(d) == w]
        weeks.append({"w": w, "start": s.isoformat(), "label": f"W{w}", "date": s.strftime("%d %b"),
                      "month": s.strftime("%b %Y"), "holidays": hol, "light": LIGHT_WEEKS.get(w, "")})
    ws_out = []
    for name, items in WORKSTREAMS:
        tasks = []
        for it in items:
            if it[0] == "◆":
                _, n, d, detail = it
                w = week_of(d)
                tasks.append({"kind": "ms", "name": n, "date": d.isoformat(), "dateLabel": d.strftime("%a %d %b %Y"),
                              "start": w, "end": w, "team": "lead", "detail": detail})
            else:
                n, team, s, e, detail = it
                tasks.append({"kind": "task", "name": n, "team": team, "start": s, "end": e, "detail": detail,
                              "contingency": n.startswith("Contingency"),
                              "from": week_start(s).strftime("%d %b"),
                              "to": (week_start(e) + dt.timedelta(days=4)).strftime("%d %b")})
        ws_out.append({"name": name, "tasks": tasks})
    modules = [{"id": i, "name": n, "track": tr, "start": s, "end": e,
                "from": week_start(s).strftime("%d %b"), "to": (week_start(e) + dt.timedelta(days=4)).strftime("%d %b"),
                "components": [{"name": c, "what": w, "done": dn} for c, w, dn in comps]}
               for i, n, tr, s, e, comps in MODULES]
    return {
        "title": "Kynex by QI Spine: Launch plan",
        "subtitle": "Weekly plan from kickoff to go-live at every QI Spine centre",
        "version": VERSION,
        "start": START.isoformat(), "kickoffLabel": KICKOFF.strftime("%a %d %b %Y"),
        "goLive": GO_LIVE.isoformat(), "goLiveLabel": GO_LIVE.strftime("%a %d %b %Y"),
        "teams": TEAMS, "weeks": weeks, "workstreams": ws_out, "modules": modules,
        "holidays": [{"date": d.isoformat(), "label": d.strftime("%a %d %b %Y"), "name": n} for d, n in HOLIDAYS],
        "roles": [{"title": t, "team": k, "duties": dd} for t, k, dd in ROLES],
        "raciRoles": RACI_ROLES, "raci": [list(r) for r in RACI],
        "risks": [{"risk": r, "level": l, "mitigation": m} for r, l, m in RISKS],
        "decisions": DECISIONS, "targets": [{"area": a, "target": t} for a, t in TARGETS],
        "assumptions": ASSUMPTIONS,
    }


if __name__ == "__main__":
    out = pathlib.Path(__file__).resolve().parent.parent / "kynex-launch-plan.json"
    out.write_text(json.dumps(build(), indent=1, ensure_ascii=False), encoding="utf-8")
    print("wrote", out)
