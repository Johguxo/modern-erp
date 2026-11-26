CREATE TABLE "approval_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"name" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_policies_doc_type_check" CHECK ("approval_policies"."doc_type" in ('SOF')),
	CONSTRAINT "approval_policies_name_check" CHECK (btrim("approval_policies"."name") <> '' and char_length("approval_policies"."name") <= 80),
	CONSTRAINT "approval_policies_version_check" CHECK ("approval_policies"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "approval_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approval_policy_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"name" text NOT NULL,
	"approver_type" text NOT NULL,
	"approver_ref" jsonb NOT NULL,
	"rule" text DEFAULT 'any' NOT NULL,
	"condition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_policy_steps_tenant_policy_order_key" UNIQUE("tenant_id","policy_id","step_order"),
	CONSTRAINT "approval_policy_steps_step_order_check" CHECK ("approval_policy_steps"."step_order" >= 1),
	CONSTRAINT "approval_policy_steps_name_check" CHECK (btrim("approval_policy_steps"."name") <> '' and char_length("approval_policy_steps"."name") <= 80),
	CONSTRAINT "approval_policy_steps_approver_type_check" CHECK ("approval_policy_steps"."approver_type" in ('users','role','requester_manager','external_email')),
	CONSTRAINT "approval_policy_steps_approver_ref_check" CHECK (("approval_policy_steps"."approver_type" = 'role' and jsonb_typeof("approval_policy_steps"."approver_ref") = 'string')
        or ("approval_policy_steps"."approver_type" = 'users' and jsonb_typeof("approval_policy_steps"."approver_ref") = 'array')
        or "approval_policy_steps"."approver_type" in ('requester_manager','external_email')),
	CONSTRAINT "approval_policy_steps_rule_check" CHECK ("approval_policy_steps"."rule" in ('any','all')),
	CONSTRAINT "approval_policy_steps_condition_check" CHECK (jsonb_typeof("approval_policy_steps"."condition") = 'object')
);
--> statement-breakpoint
ALTER TABLE "approval_policy_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy_steps" ADD CONSTRAINT "approval_policy_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy_steps" ADD CONSTRAINT "approval_policy_steps_policy_id_approval_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."approval_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_policies_tenant_doc_type_active_key" ON "approval_policies" USING btree ("tenant_id","doc_type") WHERE "approval_policies"."active";--> statement-breakpoint
CREATE INDEX "approval_policy_steps_tenant_policy_idx" ON "approval_policy_steps" USING btree ("tenant_id","policy_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "approval_policies" AS PERMISSIVE FOR ALL TO "app_user" USING ("approval_policies"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("approval_policies"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "approval_policy_steps" AS PERMISSIVE FOR ALL TO "app_user" USING ("approval_policy_steps"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("approval_policy_steps"."tenant_id" = (select app.current_tenant_id()));