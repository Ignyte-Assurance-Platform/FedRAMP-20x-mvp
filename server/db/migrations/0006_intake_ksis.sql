ALTER TABLE "customers" ADD COLUMN "cmvp_validated" boolean;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "cmvp_note" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "log_context_note" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ksi_review_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ksi_review_updated_by" text;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_ksi_review_updated_by_users_id_fk" FOREIGN KEY ("ksi_review_updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;