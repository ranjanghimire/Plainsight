-- Phase 4: RLS driven by x-plainsight-session header (PostgREST request.headers).
-- Edge Functions that use the service role are unaffected (RLS bypass).

-- Resolve current user id from opaque session token in request headers.
-- SECURITY DEFINER: reads sessions reliably while evaluating other tables' RLS.
create or replace function public.plainsight_session_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id
  from public.sessions s
  where s.id = nullif(
    trim(coalesce((current_setting('request.headers', true)::json ->> 'x-plainsight-session'), '')),
    ''
  )
    and s.expires_at > now()
  limit 1;
$$;

revoke all on function public.plainsight_session_user_id() from public;
grant execute on function public.plainsight_session_user_id() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- sessions: caller may read only their own valid row (for session-user edge).
-- ---------------------------------------------------------------------------
drop policy if exists "sessions_select_by_token" on public.sessions;
create policy "sessions_select_by_token"
  on public.sessions
  for select
  to anon, authenticated
  using (
    id = nullif(
      trim(coalesce((current_setting('request.headers', true)::json ->> 'x-plainsight-session'), '')),
      ''
    )
    and expires_at > now()
  );

-- ---------------------------------------------------------------------------
-- users: read own row when session resolves
-- ---------------------------------------------------------------------------
drop policy if exists "users_select_self" on public.users;
create policy "users_select_self"
  on public.users
  for select
  to anon, authenticated
  using (id = public.plainsight_session_user_id());

-- ---------------------------------------------------------------------------
-- workspaces: owner_id is the account id
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;

drop policy if exists "workspaces_owner_all" on public.workspaces;
create policy "workspaces_owner_all"
  on public.workspaces
  for all
  to anon, authenticated
  using (owner_id = public.plainsight_session_user_id())
  with check (owner_id = public.plainsight_session_user_id());

-- ---------------------------------------------------------------------------
-- workspace_pins: user_id column
-- ---------------------------------------------------------------------------
alter table public.workspace_pins enable row level security;

drop policy if exists "workspace_pins_user_all" on public.workspace_pins;
create policy "workspace_pins_user_all"
  on public.workspace_pins
  for all
  to anon, authenticated
  using (user_id = public.plainsight_session_user_id())
  with check (user_id = public.plainsight_session_user_id());

-- ---------------------------------------------------------------------------
-- categories, notes, archived_notes: scoped via workspace ownership
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;

drop policy if exists "categories_workspace_owner_all" on public.categories;
create policy "categories_workspace_owner_all"
  on public.categories
  for all
  to anon, authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = categories.workspace_id
        and w.owner_id = public.plainsight_session_user_id()
    )
  )
  with check (
    exists (
      select 1
      from public.workspaces w
      where w.id = categories.workspace_id
        and w.owner_id = public.plainsight_session_user_id()
    )
  );

alter table public.notes enable row level security;

drop policy if exists "notes_workspace_owner_all" on public.notes;
create policy "notes_workspace_owner_all"
  on public.notes
  for all
  to anon, authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = notes.workspace_id
        and w.owner_id = public.plainsight_session_user_id()
    )
  )
  with check (
    exists (
      select 1
      from public.workspaces w
      where w.id = notes.workspace_id
        and w.owner_id = public.plainsight_session_user_id()
    )
  );

alter table public.archived_notes enable row level security;

drop policy if exists "archived_notes_workspace_owner_all" on public.archived_notes;
create policy "archived_notes_workspace_owner_all"
  on public.archived_notes
  for all
  to anon, authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = archived_notes.workspace_id
        and w.owner_id = public.plainsight_session_user_id()
    )
  )
  with check (
    exists (
      select 1
      from public.workspaces w
      where w.id = archived_notes.workspace_id
        and w.owner_id = public.plainsight_session_user_id()
    )
  );
