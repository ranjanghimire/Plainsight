-- Persist note tags in Postgres (mirrors app `parseNoteBodyAndTags`: first line `#tag #tag2` only).
-- Kept in sync from `notes.text` / `archived_notes.text` via triggers.

-- ---------------------------------------------------------------------------
-- Extract tags from first line (case-insensitive #tokens; normalized lowercase)
-- ---------------------------------------------------------------------------
create or replace function public.plainsight_note_first_line_tags(p_text text)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_norm text;
  v_first text;
begin
  if p_text is null or p_text = '' then
    return array[]::text[];
  end if;
  v_norm := replace(p_text, E'\r\n', E'\n');
  v_norm := replace(v_norm, E'\r', E'\n');
  v_first := trim(both from split_part(v_norm, E'\n', 1));
  if v_first is null or v_first = '' then
    return array[]::text[];
  end if;
  if v_first !~* '^#[a-z0-9_]+(\s+#[a-z0-9_]+)*$' then
    return array[]::text[];
  end if;
  return coalesce(
    array(
      select distinct lower(substring(u.t from 2)) as tag
      from unnest(string_to_array(v_first, ' ')) as u(t)
      where u.t ~* '^#[a-z0-9_]+$'
      order by tag
    ),
    array[]::text[]
  );
end;
$$;

revoke all on function public.plainsight_note_first_line_tags(text) from public;
grant execute on function public.plainsight_note_first_line_tags(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- note_tags (active notes)
-- ---------------------------------------------------------------------------
create table if not exists public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  tag text not null,
  primary key (note_id, tag),
  constraint note_tags_tag_normalized check (
    tag = lower(tag)
    and tag ~ '^[a-z0-9_]+$'
  )
);

create index if not exists note_tags_workspace_tag_idx
  on public.note_tags (workspace_id, tag);

alter table public.note_tags enable row level security;

drop policy if exists "note_tags_workspace_owner_all" on public.note_tags;
create policy "note_tags_workspace_owner_all"
  on public.note_tags
  for all
  to anon, authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = note_tags.workspace_id
        and w.owner_id = public.plainsight_session_user_id()
    )
  )
  with check (
    exists (
      select 1
      from public.workspaces w
      where w.id = note_tags.workspace_id
        and w.owner_id = public.plainsight_session_user_id()
    )
  );

create or replace function public.plainsight_sync_note_tags_from_notes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.note_tags where note_id = new.id;
  insert into public.note_tags (note_id, workspace_id, tag)
  select new.id, new.workspace_id, t
  from unnest(public.plainsight_note_first_line_tags(new.text)) as t;
  return new;
end;
$$;

drop trigger if exists trg_notes_sync_note_tags on public.notes;
create trigger trg_notes_sync_note_tags
  after insert or update of text, workspace_id on public.notes
  for each row
  execute procedure public.plainsight_sync_note_tags_from_notes();

-- ---------------------------------------------------------------------------
-- archived_note_tags
-- ---------------------------------------------------------------------------
create table if not exists public.archived_note_tags (
  archived_note_id uuid not null references public.archived_notes (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  tag text not null,
  primary key (archived_note_id, tag),
  constraint archived_note_tags_tag_normalized check (
    tag = lower(tag)
    and tag ~ '^[a-z0-9_]+$'
  )
);

create index if not exists archived_note_tags_workspace_tag_idx
  on public.archived_note_tags (workspace_id, tag);

alter table public.archived_note_tags enable row level security;

drop policy if exists "archived_note_tags_workspace_owner_all" on public.archived_note_tags;
create policy "archived_note_tags_workspace_owner_all"
  on public.archived_note_tags
  for all
  to anon, authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = archived_note_tags.workspace_id
        and w.owner_id = public.plainsight_session_user_id()
    )
  )
  with check (
    exists (
      select 1
      from public.workspaces w
      where w.id = archived_note_tags.workspace_id
        and w.owner_id = public.plainsight_session_user_id()
    )
  );

create or replace function public.plainsight_sync_archived_note_tags()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.archived_note_tags where archived_note_id = new.id;
  insert into public.archived_note_tags (archived_note_id, workspace_id, tag)
  select new.id, new.workspace_id, t
  from unnest(public.plainsight_note_first_line_tags(new.text)) as t;
  return new;
end;
$$;

drop trigger if exists trg_archived_notes_sync_note_tags on public.archived_notes;
create trigger trg_archived_notes_sync_note_tags
  after insert or update of text, workspace_id on public.archived_notes
  for each row
  execute procedure public.plainsight_sync_archived_note_tags();

-- ---------------------------------------------------------------------------
-- Backfill from existing rows (idempotent)
-- ---------------------------------------------------------------------------
insert into public.note_tags (note_id, workspace_id, tag)
select n.id, n.workspace_id, t
from public.notes n
cross join lateral unnest(public.plainsight_note_first_line_tags(n.text)) as t
on conflict (note_id, tag) do nothing;

insert into public.archived_note_tags (archived_note_id, workspace_id, tag)
select a.id, a.workspace_id, t
from public.archived_notes a
cross join lateral unnest(public.plainsight_note_first_line_tags(a.text)) as t
on conflict (archived_note_id, tag) do nothing;
