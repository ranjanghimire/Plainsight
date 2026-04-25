-- Ensure workspace_activity_logs is streamed via Supabase Realtime.
-- Notifications rely on postgres_changes for this table.

do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_activity_logs'
  ) then
    alter publication supabase_realtime add table public.workspace_activity_logs;
  end if;
end $do$;

