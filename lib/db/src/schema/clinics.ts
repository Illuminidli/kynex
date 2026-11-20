import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** A clinic (QI Spine for phase 1). Every other row points at one. */
export const clinics = pgTable("clinics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
