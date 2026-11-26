ALTER POLICY "request_lines_delete_only_draft" ON "request_lines" TO app_user USING (exists (
        select 1 from requests r
        where r.id = "request_lines"."request_id" and r.tenant_id = (select app.current_tenant_id())
          and r.status in ('draft', 'changes_requested')
      ));