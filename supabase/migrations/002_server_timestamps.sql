-- 002_server_timestamps.sql
-- Server-authoritative updated_at timestamps
--
-- Client clocks can't be trusted across devices. This trigger overrides
-- updated_at with the server's now() on every INSERT or UPDATE, ensuring
-- merge resolution during pull uses a single authoritative clock.

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_tasks_updated_at
  before insert or update on tasks
  for each row execute function set_updated_at();

create trigger trg_project_notes_updated_at
  before insert or update on project_notes
  for each row execute function set_updated_at();

create trigger trg_notes_updated_at
  before insert or update on notes
  for each row execute function set_updated_at();
