CREATE TABLE "clinic_exercise_settings" (
	"clinic_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_exercise_settings_clinic_id_exercise_id_pk" PRIMARY KEY("clinic_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"region" text NOT NULL,
	"position" text NOT NULL,
	"view" text NOT NULL,
	"kind" text NOT NULL,
	"laterality" text NOT NULL,
	"content" jsonb NOT NULL,
	"calibration" text NOT NULL,
	"video_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "clinic_exercise_settings" ADD CONSTRAINT "clinic_exercise_settings_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_exercise_settings" ADD CONSTRAINT "clinic_exercise_settings_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_exercise_settings" ADD CONSTRAINT "clinic_exercise_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_region_idx" ON "exercises" USING btree ("region");