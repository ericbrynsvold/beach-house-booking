import {
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const halfSlotEnum = pgEnum("half_slot", ["am", "pm"]);

export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const reservations = pgTable("reservations", {
  id: serial("id").primaryKey(),
  resourceId: integer("resource_id")
    .references(() => resources.id)
    .notNull(),
  guestName: text("guest_name").notNull(),
  email: text("email").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const reservationSlots = pgTable(
  "reservation_slots",
  {
    id: serial("id").primaryKey(),
    reservationId: integer("reservation_id")
      .references(() => reservations.id, { onDelete: "cascade" })
      .notNull(),
    resourceId: integer("resource_id")
      .references(() => resources.id)
      .notNull(),
    dateLocal: date("date_local", { mode: "string" }).notNull(),
    slot: halfSlotEnum("slot").notNull(),
  },
  (t) => ({
    resourceDateSlot: uniqueIndex("reservation_slots_res_date_slot").on(
      t.resourceId,
      t.dateLocal,
      t.slot,
    ),
  }),
);

export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export type HalfSlot = "am" | "pm";
