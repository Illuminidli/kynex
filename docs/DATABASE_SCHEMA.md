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

## Migrations

Files are in `lib/db/migrations/`, made with `pnpm --filter @kynex/db generate --name <name>` after changing the
schema, and reviewed in the pull request. **The server applies any new migration when it starts** (each runs once,
in order, recorded in the `drizzle.__drizzle_migrations` table), so nothing is typed into the database by hand.

| # | Date | Module | File | What it does |
|---|---|---|---|---|
| 0000 | 21 Nov 2026 | M1 | `0000_m1_sign_in.sql` | Creates `clinics`, `users`, `login_sessions` |
| 0001 | 21 Nov 2026 | M2 | `0001_m2_exercise_library.sql` | Creates `exercises`, `clinic_exercise_settings`. Safe to re-run: skips anything already there |

**Rule from M2 on:** write every migration so it can run on a database that already has its tables
(`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, constraints added inside `DO $$ … EXCEPTION WHEN duplicate_object`).
Replit's Publish can copy the development schema to the production database before Kynex starts, which leaves the
tables there but not in Kynex's migration record; a plain `CREATE TABLE` then fails and stops the start-up steps.
Start-up steps (migrations, exercise library, test accounts) now run independently and each logs whether it worked;
the status page shows the library count.

## Start-up data

Every start copies the camera engine's 25 exercises into `exercises` (see above).

When `DEMO_PASSWORD` (10+ characters) is set, the server makes sure the clinic "QI Spine" and 8 test accounts exist
(`admin@kynex.test`, `clinician1-2@kynex.test`, `patient1-5@kynex.test`), all with that password. Changing the secret
and restarting moves all test accounts to the new password. Nothing else on existing accounts is touched.
