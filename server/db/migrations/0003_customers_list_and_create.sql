CREATE TYPE "public"."intake_status" AS ENUM('not_started', 'in_progress', 'submitted');--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "service_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "service_description" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "status" "intake_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "intake_token_hash" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "intake_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "intake_token_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "intake_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "intake_token_issued_by" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "unlocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "unlocked_by" text;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_intake_token_issued_by_users_id_fk" FOREIGN KEY ("intake_token_issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_unlocked_by_users_id_fk" FOREIGN KEY ("unlocked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_intake_token_hash_unique" UNIQUE("intake_token_hash");