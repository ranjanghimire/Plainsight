-- Emit workspace-scoped realtime broadcasts for collaborative tables.
-- The client subscribes to private topics:
--   workspace:<workspace_id>:notes
--   workspace:<workspace_id>:categories
--   workspace:<workspace_id>:archived_notes
--
-- These triggers call `realtime.broadcast_changes`, which writes to realtime.messages and is gated
-- by Realtime Authorization (RLS policies on realtime.messages).

create or replace function public.plainsight_broadcast_notes_changes()
returns trigger
security definer
language plpgsql
as $$
declare
  wid uuid;
begin
  wid := coalesce(new.workspace_id, old.workspace_id);
  if wid is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'workspace:' || wid::text || ':notes',
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists trg_plainsight_notes_broadcast_changes on public.notes;
create trigger trg_plainsight_notes_broadcast_changes
after insert or update or delete
on public.notes
for each row execute function public.plainsight_broadcast_notes_changes();

create or replace function public.plainsight_broadcast_categories_changes()
returns trigger
security definer
language plpgsql
as $$
declare
  wid uuid;
begin
  wid := coalesce(new.workspace_id, old.workspace_id);
  if wid is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'workspace:' || wid::text || ':categories',
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists trg_plainsight_categories_broadcast_changes on public.categories;
create trigger trg_plainsight_categories_broadcast_changes
after insert or update or delete
on public.categories
for each row execute function public.plainsight_broadcast_categories_changes();

create or replace function public.plainsight_broadcast_archived_notes_changes()
returns trigger
security definer
language plpgsql
as $$
declare
  wid uuid;
begin
  wid := coalesce(new.workspace_id, old.workspace_id);
  if wid is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'workspace:' || wid::text || ':archived_notes',
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists trg_plainsight_archived_notes_broadcast_changes on public.archived_notes;
create trigger trg_plainsight_archived_notes_broadcast_changes
after insert or update or delete
on public.archived_notes
for each row execute function public.plainsight_broadcast_archived_notes_changes();

