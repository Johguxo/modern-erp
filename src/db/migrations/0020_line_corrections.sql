ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_reconfirmation_lines_check" CHECK (("approval_steps"."kind" = 'reconfirmation') = ("approval_steps"."line_ids" is not null and cardinality("approval_steps"."line_ids") > 0));--> statement-breakpoint
ALTER POLICY "request_lines_delete_only_draft" ON "request_lines" TO app_user USING (exists (
        select 1 from requests r
        where r.id = "request_lines"."request_id" and r.tenant_id = (select app.current_tenant_id())
          and r.status = 'draft'
      ));