-- M5c: patient feedback per exercise (quick reasons + note) and an overall session comment.
-- Written to be safe to run again (IF NOT EXISTS), like every Kynex migration.
ALTER TABLE "session_exercises" ADD COLUMN IF NOT EXISTS "feedback_tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN IF NOT EXISTS "feedback_note" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "comment" text;