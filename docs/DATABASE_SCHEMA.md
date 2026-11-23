# Database schema

Kept up to date with every schema change. Table definitions live in `lib/db/src/schema/`.

Every table: random `uuid` id (or, for a pure link between two rows, those two ids together as the key), `clinic_id` where the row belongs to a clinic, `created_at` / `updated_at`.
Status-like columns are plain text checked by the API (no Postgres enums), so adding a value needs no migration.

## Tables

### clinics (M1)
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| name | text | unique. Phase 1 has one: "QI Spine" |
| created_at, updated_at | timestamptz | |

### users (M1)
Everyone who can sign in.
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| clinic_id | uuid | → clinics.id |
| email | text | unique, stored lower-case |
| display_name | text | |
| role | text | `patient`, `clinician` or `admin` (checked by the API) |
| password_hash | text | `scrypt$salt$hash`; the password itself is never stored |
| failed_sign_ins | integer | wrong passwords in a row; 5 locks the account |
| locked_until | timestamptz | set for 15 minutes after 5 wrong passwords |
| last_sign_in_at | timestamptz | |
| fresh_since | timestamptz | when created or last "reset to fresh" by an admin |
| created_at, updated_at | timestamptz | |

### login_sessions (M1)
One row per signed-in device. Deleting a row signs that device out.
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| clinic_id | uuid | → clinics.id |
| user_id | uuid | → users.id (deleted with the user) |
| token_hash | text | unique. SHA-256 of the cookie token, so a database leak can't be used to sign in |
| expires_at | timestamptz | 14 days after sign-in |
| last_seen_at | timestamptz | updated at most every 10 minutes |
| created_at | timestamptz | |

### exercises (M2)
The exercise library, shared by all clinics. Copied from the camera engine (`lib/motion`) every time the server starts:
new exercises are added and existing rows get the engine's latest wording; rows are never deleted.
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| slug | text | unique. The camera engine's exercise id, e.g. `glute-bridge`; links the row to its camera rules |
| region | text | body area: neck, shoulder, elbow, spine, core, hip, knee, ankle, balance |
| position | text | standing, seated, supine, prone, quadruped |
| view | text | `front` or `side`: how the person faces the camera |
| kind | text | `reps`, `hold` or `timed-balance` |
| laterality | text | `bilateral`, `unilateral` or `alternating` |
| content | jsonb | name, summary, setup, steps, precautions (each in English and Hindi), tags, usual dose |
| calibration | text | `draft`, `lab-tested` or `clinician-reviewed` (camera thresholds) |
| video_status | text | `none`, `draft` or `approved` (videos arrive in M7) |
| created_at, updated_at | timestamptz | updated_at changes only when the wording or calibration changes |

### clinic_exercise_settings (M2)
A clinic's own choices about a library exercise. Key: (clinic_id, exercise_id).
| Column | Type | Notes |
|---|---|---|
| clinic_id | uuid | → clinics.id |
| exercise_id | uuid | → exercises.id (deleted with the exercise) |
| hidden | boolean | hidden exercises can't be added to new plans in this clinic |
| updated_by | uuid | → users.id, the admin who last changed it |
| created_at, updated_at | timestamptz | |

### care_teams (M3)
Which doctor looks after which patient (phase 1: one doctor per patient; set automatically for the demo accounts).
| Column | Type | Notes |
|---|---|---|
| patient_id | uuid | primary key, → users.id |
| clinician_id | uuid | → users.id |
| clinic_id | uuid | → clinics.id |
| created_at | timestamptz | |

### prescriptions (M3)
A patient's exercise plan; one per patient (unique patient_id). Every change is written to `activity`.
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| clinic_id, patient_id | uuid | |
| updated_by | uuid | → users.id, who last changed it |
| start_date, end_date | date | clinic days (India time); end optional |
| note | text | shown to the patient |
| created_at, updated_at | timestamptz | |

### prescription_items (M3)
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| prescription_id | uuid | → prescriptions.id (deleted with the plan) |
| exercise_id | uuid | → exercises.id |
| sort | integer | order in the session |
| sets, rest_seconds | integer | |
| reps / hold_seconds | integer | one of the two, by exercise kind |
| weekdays | integer[] | 0 = Sunday … 6 = Saturday |
| times_per_day | integer | 1-3 |
| side | text | `both`, `left`, `right` (one-side exercises only) |
| note | text | |

### sessions (M4)
One exercise session. `status`: in-progress, completed, stopped, red-flag (stopped at the check-in).
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| clinic_id, patient_id | uuid | |
| day | text | clinic day it counts for |
| status | text | |
| check_in | jsonb | pain 0-10 and red-flag answers |
| pain_after | integer | |
| started_at, ended_at | timestamptz | |
| reviewed_by, reviewed_at, review_note | | the doctor's review (M5) |

### session_exercises (M4)
The result of one exercise in a session: the dose asked for (copied from the plan), sets, full/partial reps, holds,
best range, form score, how it felt, every rep (`reps` jsonb: set, side, times, range, faults, score), holds, fault counts,
how much of the time the camera saw the patient, and whether a video was kept **on the patient's phone** (the video itself is never sent).

### motion_tracks (M4)
The movement of one exercise as joint positions only (19 joints, 10 per second, millimetres; no picture), used to replay it
as an animated figure for the doctor. Key: session_exercise_id.

### symptom_reports (M4)
From the check-in (with red flags), during a session, or from the home page. `acknowledged_by/at` when the doctor reads it.

### patient_notes (M5)
Doctor's notes about a patient (clinic only).

### activity (M3-M5b)
Every patient interaction and change, newest first: plan changes, sessions, check-ins, symptoms, reviews, notes, bookings,
waiting-list offers. Only ever added to. It is the audit trail and the admin's activity feed. `kind` e.g. `plan.changed`, `booking.cancelled`.

### visit_types (M5b)
Per clinic: code, name (English and Hindi), minutes, mode (`clinic`, `video`, `home`). Seeded: first assessment 45 min,
follow-up 30, video consult 20, home visit 60 (drafts).

### availability (M5b)
A doctor's weekly hours, minutes from midnight India time. Several rows on a day leave breaks. Seeded Mon-Sat 9-13 and 14-18.

### time_off (M5b)
Leave (with a doctor) or clinic holiday (no doctor), from/to dates and a reason.

### appointments (M5b)
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| clinic_id, clinician_id, patient_id, visit_type_id | uuid | |
| starts_at, ends_at | timestamptz | |
| status | text | booked, confirmed, arrived, completed, no-show, cancelled |
| series_id | uuid | shared by a repeating series |
| meeting_link | text | video consults |
| note, cancel_reason | text | |
| created_by, cancelled_by | uuid | → users.id |
| created_at, updated_at | timestamptz | |

### waitlist (M5b)
A patient waiting for a slot between two dates (any time, morning or afternoon). When a visit is cancelled or moved, the
first matching entry is `offered` that time (held up to 12 hours); declined or expired offers move on to the next person.

## Migrations

Files are in `lib/db/migrations/`, made with `pnpm --filter @kynex/db generate --name <name>` after changing the
schema, and reviewed in the pull request. **The server applies any new migration when it starts** (each runs once,
in order, recorded in the `drizzle.__drizzle_migrations` table), so nothing is typed into the database by hand.

| # | Date | Module | File | What it does |
|---|---|---|---|---|
| 0000 | 21 Nov 2026 | M1 | `0000_m1_sign_in.sql` | Creates `clinics`, `users`, `login_sessions` |
| 0001 | 21 Nov 2026 | M2 | `0001_m2_exercise_library.sql` | Creates `exercises`, `clinic_exercise_settings`. Safe to re-run: skips anything already there |
| 0002 | 23 Nov 2026 | M3-M5b | `0002_m3_m5b_care_sessions_bookings.sql` | Creates plans, sessions and results, movement tracks, symptoms, notes, activity, visit types, hours, time off, appointments, waiting list. Safe to re-run |

**Rule from M2 on:** write every migration so it can run on a database that already has its tables
(`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, constraints added inside `DO $$ … EXCEPTION WHEN duplicate_object`).
Replit's Publish can copy the development schema to the production database before Kynex starts, which leaves the
tables there but not in Kynex's migration record; a plain `CREATE TABLE` then fails and stops the start-up steps.
Start-up steps (migrations, exercise library, test accounts) now run independently and each logs whether it worked;
the status page shows the library count.

## Start-up data

Every start copies the camera engine's 25 exercises into `exercises` (see above).

When `DEMO_PASSWORD` (10+ characters) is set, the server makes sure the clinic "QI Spine" and 4 test accounts exist
(`admin@kynex.test`, `clinician1@kynex.test` = "Doctor One", `patient1@kynex.test`, `patient2@kynex.test`), all with that
password. From M3 the earlier extra test accounts (clinician2, patient3-5) are removed with all their data. Both patients
are assigned to Doctor One, the doctor gets default hours once, and the clinic gets its visit types once.
Changing the secret and restarting moves all test accounts to the new password.
"Reset to fresh" on a patient also deletes their plan, sessions, results, symptoms, notes, visits, waiting list and activity.
