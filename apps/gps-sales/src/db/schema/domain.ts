import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Mirrors docs/source/001_initial_schema.sql.
 * Billing tables are schema-only until Phase 4. There is no `users` table;
 * Better Auth owns `user` in auth.ts.
 */

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("active"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "organizations_status_check",
      sql`${table.status} IN ('active', 'suspended', 'closed')`,
    ),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    check(
      "memberships_role_check",
      sql`${table.role} IN ('owner', 'admin', 'manager', 'staff')`,
    ),
    check(
      "memberships_status_check",
      sql`${table.status} IN ('active', 'invited', 'disabled')`,
    ),
    index("memberships_user_idx").on(table.userId, table.status),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    address: text("address"),
    contactName: text("contact_name"),
    phone: text("phone"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("customers_id_organization_id_key").on(table.id, table.organizationId),
    check(
      "customers_latitude_check",
      sql`${table.latitude} BETWEEN -90 AND 90`,
    ),
    check(
      "customers_longitude_check",
      sql`${table.longitude} BETWEEN -180 AND 180`,
    ),
    index("customers_org_name_idx").on(table.organizationId, table.name),
  ],
);

export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    customerId: uuid("customer_id").notNull(),
    staffUserId: text("staff_user_id").notNull(),
    status: text("status").notNull().default("in_progress"),
    purpose: text("purpose"),
    notes: text("notes"),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    endedAt: timestamptz("ended_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("visits_id_organization_id_key").on(table.id, table.organizationId),
    check(
      "visits_status_check",
      sql`${table.status} IN ('in_progress', 'completed', 'cancelled')`,
    ),
    foreignKey({
      name: "visits_customer_organization_fkey",
      columns: [table.customerId, table.organizationId],
      foreignColumns: [customers.id, customers.organizationId],
    }),
    foreignKey({
      name: "visits_staff_membership_fkey",
      columns: [table.organizationId, table.staffUserId],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),
    index("visits_org_started_idx").on(
      table.organizationId,
      table.startedAt.desc(),
    ),
    index("visits_org_staff_idx").on(
      table.organizationId,
      table.staffUserId,
      table.startedAt.desc(),
    ),
  ],
);

export const visitLocations = pgTable(
  "visit_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    visitId: uuid("visit_id").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    accuracyM: doublePrecision("accuracy_m"),
    capturedAt: timestamptz("captured_at").notNull(),
    receivedAt: timestamptz("received_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "visit_locations_latitude_check",
      sql`${table.latitude} BETWEEN -90 AND 90`,
    ),
    check(
      "visit_locations_longitude_check",
      sql`${table.longitude} BETWEEN -180 AND 180`,
    ),
    check(
      "visit_locations_accuracy_m_check",
      sql`${table.accuracyM} >= 0`,
    ),
    foreignKey({
      name: "visit_locations_visit_organization_fkey",
      columns: [table.visitId, table.organizationId],
      foreignColumns: [visits.id, visits.organizationId],
    }),
    index("visit_locations_visit_idx").on(table.organizationId, table.visitId),
  ],
);

export const visitPhotos = pgTable(
  "visit_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    visitId: uuid("visit_id").notNull(),
    objectKey: text("object_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    capturedAt: timestamptz("captured_at"),
    uploadedAt: timestamptz("uploaded_at").notNull().defaultNow(),
  },
  (table) => [
    check("visit_photos_byte_size_check", sql`${table.byteSize} > 0`),
    foreignKey({
      name: "visit_photos_visit_organization_fkey",
      columns: [table.visitId, table.organizationId],
      foreignColumns: [visits.id, visits.organizationId],
    }),
    index("visit_photos_visit_idx").on(table.organizationId, table.visitId),
  ],
);

export const visitOutcomes = pgTable(
  "visit_outcomes",
  {
    organizationId: uuid("organization_id").notNull(),
    visitId: uuid("visit_id").notNull(),
    outcome: text("outcome").notNull(),
    nextAction: text("next_action"),
    followUpAt: timestamptz("follow_up_at"),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.visitId] }),
    check(
      "visit_outcomes_outcome_check",
      sql`${table.outcome} IN ('success', 'pending', 'failed', 'other')`,
    ),
    foreignKey({
      name: "visit_outcomes_visit_organization_fkey",
      columns: [table.visitId, table.organizationId],
      foreignColumns: [visits.id, visits.organizationId],
    }),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detailsJson: jsonb("details_json").notNull().default({}),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_org_time_idx").on(
      table.organizationId,
      table.createdAt.desc(),
    ),
  ],
);

export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    monthlyPriceYen: integer("monthly_price_yen").notNull(),
    includedUsers: integer("included_users").notNull(),
    includedVisits: integer("included_visits").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [
    check("plans_monthly_price_yen_check", sql`${table.monthlyPriceYen} >= 0`),
    check("plans_included_users_check", sql`${table.includedUsers} >= 0`),
    check("plans_included_visits_check", sql`${table.includedVisits} >= 0`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status").notNull(),
    billingProvider: text("billing_provider"),
    externalCustomerId: text("external_customer_id"),
    externalSubscriptionId: text("external_subscription_id"),
    currentPeriodEnd: timestamptz("current_period_end"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "subscriptions_status_check",
      sql`${table.status} IN ('trialing', 'active', 'past_due', 'cancelled')`,
    ),
  ],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    periodMonth: date("period_month").notNull(),
    visitCount: integer("visit_count").notNull().default(0),
    photoBytes: bigint("photo_bytes", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.periodMonth] }),
    check("usage_records_visit_count_check", sql`${table.visitCount} >= 0`),
    check("usage_records_photo_bytes_check", sql`${table.photoBytes} >= 0`),
  ],
);
