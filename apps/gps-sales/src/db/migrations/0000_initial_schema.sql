-- GPS Sales SaaS initial migration.
-- Domain tables mirror 001_initial_schema.sql via the Drizzle schema in src/db/schema/domain.ts.
-- Auth tables (user, session, account, verification) come from Better Auth CLI
-- `npx auth@1.7.12 generate --adapter drizzle --dialect postgresql`.
-- There is no "users" table. Do not add one.
-- Apply only to a NEW Neon project after review. Do not use drizzle-kit push.
-- CREATE EXTENSION is from 001_initial_schema.sql. PostgreSQL 13+ also provides gen_random_uuid() in core.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"details_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"contact_name" text,
	"phone" text,
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_id_organization_id_key" UNIQUE("id","organization_id"),
	CONSTRAINT "customers_latitude_check" CHECK ("customers"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "customers_longitude_check" CHECK ("customers"."longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" IN ('owner', 'admin', 'manager', 'staff')),
	CONSTRAINT "memberships_status_check" CHECK ("memberships"."status" IN ('active', 'invited', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_status_check" CHECK ("organizations"."status" IN ('active', 'suspended', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_price_yen" integer NOT NULL,
	"included_users" integer NOT NULL,
	"included_visits" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "plans_monthly_price_yen_check" CHECK ("plans"."monthly_price_yen" >= 0),
	CONSTRAINT "plans_included_users_check" CHECK ("plans"."included_users" >= 0),
	CONSTRAINT "plans_included_visits_check" CHECK ("plans"."included_visits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"status" text NOT NULL,
	"billing_provider" text,
	"external_customer_id" text,
	"external_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" IN ('trialing', 'active', 'past_due', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"organization_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"photo_bytes" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_records_organization_id_period_month_pk" PRIMARY KEY("organization_id","period_month"),
	CONSTRAINT "usage_records_visit_count_check" CHECK ("usage_records"."visit_count" >= 0),
	CONSTRAINT "usage_records_photo_bytes_check" CHECK ("usage_records"."photo_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "visit_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy_m" double precision,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_locations_latitude_check" CHECK ("visit_locations"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "visit_locations_longitude_check" CHECK ("visit_locations"."longitude" BETWEEN -180 AND 180),
	CONSTRAINT "visit_locations_accuracy_m_check" CHECK ("visit_locations"."accuracy_m" >= 0)
);
--> statement-breakpoint
CREATE TABLE "visit_outcomes" (
	"organization_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"next_action" text,
	"follow_up_at" timestamp with time zone,
	CONSTRAINT "visit_outcomes_organization_id_visit_id_pk" PRIMARY KEY("organization_id","visit_id"),
	CONSTRAINT "visit_outcomes_outcome_check" CHECK ("visit_outcomes"."outcome" IN ('success', 'pending', 'failed', 'other'))
);
--> statement-breakpoint
CREATE TABLE "visit_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"captured_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_photos_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "visit_photos_byte_size_check" CHECK ("visit_photos"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"staff_user_id" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"purpose" text,
	"notes" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_id_organization_id_key" UNIQUE("id","organization_id"),
	CONSTRAINT "visits_status_check" CHECK ("visits"."status" IN ('in_progress', 'completed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_locations" ADD CONSTRAINT "visit_locations_visit_organization_fkey" FOREIGN KEY ("visit_id","organization_id") REFERENCES "public"."visits"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_outcomes" ADD CONSTRAINT "visit_outcomes_visit_organization_fkey" FOREIGN KEY ("visit_id","organization_id") REFERENCES "public"."visits"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_photos" ADD CONSTRAINT "visit_photos_visit_organization_fkey" FOREIGN KEY ("visit_id","organization_id") REFERENCES "public"."visits"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_customer_organization_fkey" FOREIGN KEY ("customer_id","organization_id") REFERENCES "public"."customers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_staff_membership_fkey" FOREIGN KEY ("organization_id","staff_user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_logs_org_time_idx" ON "audit_logs" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "customers_org_name_idx" ON "customers" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "visit_locations_visit_idx" ON "visit_locations" USING btree ("organization_id","visit_id");--> statement-breakpoint
CREATE INDEX "visit_photos_visit_idx" ON "visit_photos" USING btree ("organization_id","visit_id");--> statement-breakpoint
CREATE INDEX "visits_org_started_idx" ON "visits" USING btree ("organization_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "visits_org_staff_idx" ON "visits" USING btree ("organization_id","staff_user_id","started_at" DESC NULLS LAST);
--> statement-breakpoint
-- SECURITY WARNING:
-- The application uses Better Auth server-side and ALWAYS checks organization membership
-- and includes organization_id in queries. This migration does not enable RLS because a safe
-- DB role and per-request tenant context has not been configured. Do not expose DB credentials
-- to clients or assume PostgreSQL RLS is active. Add defense-in-depth RLS with a verified
-- transaction-scoped tenant context only after a threat-model and role audit.