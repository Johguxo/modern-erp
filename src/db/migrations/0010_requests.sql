CREATE TABLE "document_sequences" (
	"tenant_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"prefix" text NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"padding" integer DEFAULT 4 NOT NULL,
	"last_issued_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_sequences_pkey" PRIMARY KEY("tenant_id","doc_type"),
	CONSTRAINT "document_sequences_doc_type_check" CHECK ("document_sequences"."doc_type" in ('SOF')),
	CONSTRAINT "document_sequences_prefix_check" CHECK ("document_sequences"."prefix" ~ '^[A-Z0-9][A-Z0-9._/-]{0,15}$'),
	CONSTRAINT "document_sequences_next_number_check" CHECK ("document_sequences"."next_number" >= 1),
	CONSTRAINT "document_sequences_padding_check" CHECK ("document_sequences"."padding" between 1 and 10),
	CONSTRAINT "document_sequences_last_issued_check" CHECK ("document_sequences"."last_issued_number" is null or ("document_sequences"."last_issued_number" >= 1 and "document_sequences"."last_issued_number" < "document_sequences"."next_number"))
);
--> statement-breakpoint
ALTER TABLE "document_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "request_line_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"request_line_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "request_line_revisions_tenant_line_revision_key" UNIQUE("tenant_id","request_line_id","revision"),
	CONSTRAINT "request_line_revisions_revision_check" CHECK ("request_line_revisions"."revision" >= 1),
	CONSTRAINT "request_line_revisions_reason_check" CHECK (btrim("request_line_revisions"."reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "request_line_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"product_code_snapshot" text NOT NULL,
	"description_snapshot" text NOT NULL,
	"unit_snapshot" text NOT NULL,
	"equipment_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 4) NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"needs_reconfirmation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_lines_tenant_request_line_no_key" UNIQUE("tenant_id","request_id","line_no"),
	CONSTRAINT "request_lines_line_no_check" CHECK ("request_lines"."line_no" >= 1),
	CONSTRAINT "request_lines_quantity_check" CHECK ("request_lines"."quantity" > 0),
	CONSTRAINT "request_lines_unit_price_check" CHECK ("request_lines"."unit_price" >= 0),
	CONSTRAINT "request_lines_subtotal_check" CHECK ("request_lines"."subtotal" >= 0),
	CONSTRAINT "request_lines_status_check" CHECK ("request_lines"."status" in ('active','removed')),
	CONSTRAINT "request_lines_revision_check" CHECK ("request_lines"."revision" >= 1),
	CONSTRAINT "request_lines_snapshots_check" CHECK (btrim("request_lines"."product_code_snapshot") <> '' and btrim("request_lines"."description_snapshot") <> '' and btrim("request_lines"."unit_snapshot") <> ''),
	CONSTRAINT "request_lines_notes_length_check" CHECK (char_length("request_lines"."notes") <= 500)
);
--> statement-breakpoint
ALTER TABLE "request_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"doc_type" text DEFAULT 'SOF' NOT NULL,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"requester_id" uuid NOT NULL,
	"cost_center_id" uuid,
	"warehouse_id" uuid NOT NULL,
	"equipment_id" uuid,
	"reason" text,
	"currency" text NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_doc_type_check" CHECK ("requests"."doc_type" in ('SOF')),
	CONSTRAINT "requests_status_check" CHECK ("requests"."status" in ('draft','in_approval','changes_requested','approved','delivered','rejected','cancelled')),
	CONSTRAINT "requests_currency_check" CHECK ("requests"."currency" in ('PEN','USD')),
	CONSTRAINT "requests_total_amount_check" CHECK ("requests"."total_amount" >= 0),
	CONSTRAINT "requests_version_check" CHECK ("requests"."version" >= 1),
	CONSTRAINT "requests_reason_length_check" CHECK (char_length("requests"."reason") <= 500),
	CONSTRAINT "requests_draft_without_number_check" CHECK ("requests"."status" <> 'draft' or "requests"."number" is null),
	CONSTRAINT "requests_number_required_check" CHECK ("requests"."status" in ('draft','cancelled') or "requests"."number" is not null),
	CONSTRAINT "requests_number_submitted_check" CHECK (("requests"."number" is null) = ("requests"."submitted_at" is null))
);
--> statement-breakpoint
ALTER TABLE "requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_line_revisions" ADD CONSTRAINT "request_line_revisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_line_revisions" ADD CONSTRAINT "request_line_revisions_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_line_revisions" ADD CONSTRAINT "request_line_revisions_request_line_id_request_lines_id_fk" FOREIGN KEY ("request_line_id") REFERENCES "public"."request_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_line_revisions" ADD CONSTRAINT "request_line_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_line_revisions_tenant_request_idx" ON "request_line_revisions" USING btree ("tenant_id","request_id");--> statement-breakpoint
CREATE INDEX "request_lines_tenant_request_idx" ON "request_lines" USING btree ("tenant_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_tenant_doc_number_key" ON "requests" USING btree ("tenant_id","doc_type","number") WHERE "requests"."number" is not null;--> statement-breakpoint
CREATE INDEX "requests_tenant_status_updated_idx" ON "requests" USING btree ("tenant_id","status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_tenant_requester_updated_idx" ON "requests" USING btree ("tenant_id","requester_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_tenant_updated_idx" ON "requests" USING btree ("tenant_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "document_sequences" AS PERMISSIVE FOR ALL TO "app_user" USING ("document_sequences"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("document_sequences"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "request_line_revisions_read" ON "request_line_revisions" AS PERMISSIVE FOR SELECT TO "app_user" USING ("request_line_revisions"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "request_line_revisions_insert" ON "request_line_revisions" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("request_line_revisions"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "request_lines" AS PERMISSIVE FOR ALL TO "app_user" USING ("request_lines"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("request_lines"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "request_lines_delete_only_draft" ON "request_lines" AS RESTRICTIVE FOR DELETE TO "app_user" USING (exists (
        select 1 from requests r
        where r.id = "request_lines"."request_id" and r.tenant_id = (select app.current_tenant_id()) and r.status = 'draft'
      ));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "requests" AS PERMISSIVE FOR ALL TO "app_user" USING ("requests"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("requests"."tenant_id" = (select app.current_tenant_id()));