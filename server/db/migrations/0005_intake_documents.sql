ALTER TABLE "documents" ALTER COLUMN "sha256" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "md5" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "crc32c" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "kind_note" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "policy_version" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "policy_updated_on" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "added_after_submit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "replaces_document_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "removed_by" text;