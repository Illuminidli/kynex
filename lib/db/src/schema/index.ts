// Table definitions live here, one file per area (e.g. users.ts, exercises.ts),
// re-exported from this file. M0 has no tables yet.
//
// Rules every table follows (see docs/ARCHITECTURE.md):
// - id: uuid primary key, generated randomly (never 1, 2, 3...)
// - clinic_id on every row that belongs to a clinic
// - created_at / updated_at timestamps, created_by where a person made it
// - status-like fields are text checked by the API, not Postgres enums
export {};
