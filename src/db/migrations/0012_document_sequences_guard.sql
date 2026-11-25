-- Guarda de la numeración: un número emitido nunca se reutiliza. Aunque el código ya lo evita, la
-- base rechaza bajar last_issued_number (o volverlo null) y dejar next_number en un valor ya emitido.
create or replace function app.document_sequences_guard() returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if old.last_issued_number is not null
     and (new.last_issued_number is null or new.last_issued_number < old.last_issued_number) then
    raise exception 'document_sequences: last_issued_number cannot decrease'
      using errcode = 'check_violation';
  end if;
  if new.next_number <= coalesce(old.last_issued_number, 0) then
    raise exception 'document_sequences: next_number must be above last_issued_number'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
create trigger document_sequences_guard
  before update on document_sequences
  for each row execute function app.document_sequences_guard();
