CREATE TABLE "approval_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"instance_id" uuid,
	"step_id" uuid,
	"type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"comment" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_events_actor_type_check" CHECK ("approval_events"."actor_type" in ('user','system','external')),
	CONSTRAINT "approval_events_actor_user_check" CHECK ("approval_events"."actor_type" <> 'user' or "approval_events"."actor_user_id" is not null),
	CONSTRAINT "approval_events_comment_check" CHECK (char_length("approval_events"."comment") <= 500),
	CONSTRAINT "approval_events_data_check" CHECK (jsonb_typeof("approval_events"."data") = 'object')
);
--> statement-breakpoint
ALTER TABLE "approval_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approval_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"policy_id" uuid NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_instances_tenant_request_round_key" UNIQUE("tenant_id","request_id","round"),
	CONSTRAINT "approval_instances_round_check" CHECK ("approval_instances"."round" >= 1),
	CONSTRAINT "approval_instances_status_check" CHECK ("approval_instances"."status" in ('in_progress','approved','rejected','changes_requested','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "approval_instances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approval_step_assignees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"user_id" uuid,
	"external_email" text,
	"decision" text,
	"decided_at" timestamp with time zone,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_step_assignees_tenant_step_user_key" UNIQUE("tenant_id","step_id","user_id"),
	CONSTRAINT "approval_step_assignees_target_check" CHECK (("approval_step_assignees"."user_id" is not null) <> ("approval_step_assignees"."external_email" is not null)),
	CONSTRAINT "approval_step_assignees_decision_check" CHECK ("approval_step_assignees"."decision" is null or "approval_step_assignees"."decision" in ('approved','rejected','changes_requested')),
	CONSTRAINT "approval_step_assignees_comment_check" CHECK (char_length("approval_step_assignees"."comment") <= 500)
);
--> statement-breakpoint
ALTER TABLE "approval_step_assignees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'normal' NOT NULL,
	"rule" text NOT NULL,
	"status" text NOT NULL,
	"line_ids" uuid[],
	"pending_since" timestamp with time zone,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_steps_step_order_check" CHECK ("approval_steps"."step_order" >= 1),
	CONSTRAINT "approval_steps_kind_check" CHECK ("approval_steps"."kind" in ('normal','reconfirmation')),
	CONSTRAINT "approval_steps_rule_check" CHECK ("approval_steps"."rule" in ('any','all')),
	CONSTRAINT "approval_steps_status_check" CHECK ("approval_steps"."status" in ('waiting','pending','approved','rejected','changes_requested','skipped','cancelled')),
	CONSTRAINT "approval_steps_comment_check" CHECK (char_length("approval_steps"."comment") <= 500)
);
--> statement-breakpoint
ALTER TABLE "approval_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_instance_id_approval_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."approval_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_step_id_approval_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."approval_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_policy_id_approval_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."approval_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step_assignees" ADD CONSTRAINT "approval_step_assignees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step_assignees" ADD CONSTRAINT "approval_step_assignees_step_id_approval_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."approval_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step_assignees" ADD CONSTRAINT "approval_step_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_instance_id_approval_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."approval_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_events_tenant_request_created_idx" ON "approval_events" USING btree ("tenant_id","request_id","created_at");--> statement-breakpoint
CREATE INDEX "approval_step_assignees_tenant_user_idx" ON "approval_step_assignees" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "approval_step_assignees_tenant_step_idx" ON "approval_step_assignees" USING btree ("tenant_id","step_id");--> statement-breakpoint
CREATE INDEX "approval_steps_tenant_instance_idx" ON "approval_steps" USING btree ("tenant_id","instance_id");--> statement-breakpoint
CREATE INDEX "approval_steps_tenant_request_idx" ON "approval_steps" USING btree ("tenant_id","request_id");--> statement-breakpoint
CREATE POLICY "approval_events_read" ON "approval_events" AS PERMISSIVE FOR SELECT TO "app_user" USING ("approval_events"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "approval_events_insert" ON "approval_events" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("approval_events"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "approval_instances" AS PERMISSIVE FOR ALL TO "app_user" USING ("approval_instances"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("approval_instances"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "approval_step_assignees" AS PERMISSIVE FOR ALL TO "app_user" USING ("approval_step_assignees"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("approval_step_assignees"."tenant_id" = (select app.current_tenant_id()));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "approval_steps" AS PERMISSIVE FOR ALL TO "app_user" USING ("approval_steps"."tenant_id" = (select app.current_tenant_id())) WITH CHECK ("approval_steps"."tenant_id" = (select app.current_tenant_id()));