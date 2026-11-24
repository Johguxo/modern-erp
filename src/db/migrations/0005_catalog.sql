CREATE TABLE "cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_centers_code_normalized" CHECK ("cost_centers"."code" = upper(btrim("cost_centers"."code"))),
	CONSTRAINT "cost_centers_code_not_empty" CHECK ("cost_centers"."code" <> ''),
	CONSTRAINT "cost_centers_name_not_empty" CHECK (btrim("cost_centers"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "cost_centers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_code_normalized" CHECK ("equipment"."code" = upper(btrim("equipment"."code"))),
	CONSTRAINT "equipment_code_not_empty" CHECK ("equipment"."code" <> ''),
	CONSTRAINT "equipment_name_not_empty" CHECK (btrim("equipment"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "equipment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"file_path" text,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_jobs_kind_check" CHECK ("import_jobs"."kind" in ('products','equipment','stock')),
	CONSTRAINT "import_jobs_status_check" CHECK ("import_jobs"."status" in ('pending','processing','completed','failed'))
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"category" text,
	"reference_price" numeric(14, 4),
	"currency" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_code_normalized" CHECK ("products"."code" = upper(btrim("products"."code"))),
	CONSTRAINT "products_code_not_empty" CHECK ("products"."code" <> ''),
	CONSTRAINT "products_name_not_empty" CHECK (btrim("products"."name") <> ''),
	CONSTRAINT "products_unit_not_empty" CHECK (btrim("products"."unit") <> ''),
	CONSTRAINT "products_currency_check" CHECK ("products"."currency" is null or "products"."currency" in ('PEN','USD')),
	CONSTRAINT "products_price_currency_check" CHECK (("products"."reference_price" is null and "products"."currency" is null) or ("products"."reference_price" is not null and "products"."currency" is not null and "products"."reference_price" >= 0))
);
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_code_normalized" CHECK ("warehouses"."code" = upper(btrim("warehouses"."code"))),
	CONSTRAINT "warehouses_code_not_empty" CHECK ("warehouses"."code" <> ''),
	CONSTRAINT "warehouses_name_not_empty" CHECK (btrim("warehouses"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centers_tenant_code_key" ON "cost_centers" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_tenant_code_key" ON "equipment" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "import_jobs_tenant_created_idx" ON "import_jobs" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_code_key" ON "products" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "products_tenant_name_idx" ON "products" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "products_code_trgm_idx" ON "products" USING gin ("code" extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin ("name" extensions.gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_tenant_code_key" ON "warehouses" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_one_default_per_tenant" ON "warehouses" USING btree ("tenant_id") WHERE "warehouses"."is_default";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "cost_centers" AS PERMISSIVE FOR ALL TO "app_user" USING ("cost_centers"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("cost_centers"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "equipment" AS PERMISSIVE FOR ALL TO "app_user" USING ("equipment"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("equipment"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "import_jobs" AS PERMISSIVE FOR ALL TO "app_user" USING ("import_jobs"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("import_jobs"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "products" AS PERMISSIVE FOR ALL TO "app_user" USING ("products"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("products"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "warehouses" AS PERMISSIVE FOR ALL TO "app_user" USING ("warehouses"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("warehouses"."tenant_id" = (select app.current_tenant_id()));