CREATE TABLE "package_overview_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by" text,
	"schema_version" text NOT NULL,
	"schema_commit" text NOT NULL,
	"rules_version" text,
	"valid" boolean NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answers_updated_at" timestamp with time zone,
	"file_name" text NOT NULL,
	"json" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "assessor_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "assessor_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "assessor_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "assessor_confirmed_by" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "advisor_name" text DEFAULT 'Ignyte' NOT NULL;--> statement-breakpoint
ALTER TABLE "package_overview_files" ADD CONSTRAINT "package_overview_files_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_overview_files" ADD CONSTRAINT "package_overview_files_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "package_overview_files_customer_generated_idx" ON "package_overview_files" USING btree ("customer_id","generated_at");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_assessor_confirmed_by_users_id_fk" FOREIGN KEY ("assessor_confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;