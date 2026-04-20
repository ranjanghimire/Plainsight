-- Tables the app subscribes to via Supabase Realtime `postgres_changes` (see src/sync/syncEngine.ts).
-- Enabling only workspace_shares / workspace_activity_logs is not enough: collaborative edits
-- live in public.notes, categories, and archived_notes.

do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;
end $do$;

do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table public.categories;
  end if;
end $do$;

do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'archived_notes'
  ) then
    alter publication supabase_realtime add table public.archived_notes;
  end if;
end $do$;

do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspaces'
  ) then
    alter publication supabase_realtime add table public.workspaces;
  end if;
end $do$;

do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_pins'
  ) then
    alter publication supabase_realtime add table public.workspace_pins;
  end if;
end $do$;
