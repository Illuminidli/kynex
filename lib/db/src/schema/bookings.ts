import { boolean, date, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics.ts";
import { users } from "./users.ts";

export const VISIT_MODES = ["clinic", "video", "home"] as const;
export type VisitMode = (typeof VISIT_MODES)[number];

/** Kinds of appointment a clinic offers, each with its own length and place. */
export const visitTypes = pgTable(
  "visit_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameHi: text("name_hi").notNull(),
    minutes: integer("minutes").notNull(),
    mode: text("mode").$type<VisitMode>().notNull(),
    sort: integer("sort").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("visit_types_clinic_code_unique").on(t.clinicId, t.code)],
);

/** A doctor's weekly working hours. Several rows on one day leave gaps for breaks. Minutes from midnight, India time. */
export const availability = pgTable(
  "availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [index("availability_clinician_idx").on(t.clinicianId)],
);

/** Days nobody can book: a doctor's leave, or (with no doctor) a clinic holiday. */
export const timeOff = pgTable(
  "time_off",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    clinicianId: uuid("clinician_id").references(() => users.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    reason: text("reason").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("time_off_clinic_idx").on(t.clinicId, t.startDate)],
);

export const APPOINTMENT_STATUSES = ["booked", "confirmed", "arrived", "completed", "no-show", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    visitTypeId: uuid("visit_type_id")
      .notNull()
      .references(() => visitTypes.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").$type<AppointmentStatus>().notNull().default("booked"),
    /** Shared by every visit booked together as a repeating series. */
    seriesId: uuid("series_id"),
    /** Video consults: link to the meeting (made outside Kynex). Home visits: the address note. */
    meetingLink: text("meeting_link"),
    note: text("note").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appointments_clinician_time_idx").on(t.clinicianId, t.startsAt),
    index("appointments_patient_time_idx").on(t.patientId, t.startsAt),
    index("appointments_clinic_time_idx").on(t.clinicId, t.startsAt),
  ],
);

export const WAITLIST_STATUSES = ["waiting", "offered", "booked", "removed"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

/** Patients waiting for an earlier or a free slot. When one opens, the first matching patient is offered it. */
export const waitlist = pgTable(
  "waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    visitTypeId: uuid("visit_type_id")
      .notNull()
      .references(() => visitTypes.id),
    fromDate: date("from_date", { mode: "string" }).notNull(),
    toDate: date("to_date", { mode: "string" }).notNull(),
    /** any, morning (before 1 pm) or afternoon. */
    timeOfDay: text("time_of_day").$type<"any" | "morning" | "afternoon">().notNull().default("any"),
    status: text("status").$type<WaitlistStatus>().notNull().default("waiting"),
    offerStartsAt: timestamp("offer_starts_at", { withTimezone: true }),
    offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("waitlist_clinic_idx").on(t.clinicId, t.status)],
);
