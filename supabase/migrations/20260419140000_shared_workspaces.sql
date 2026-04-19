-- Shared workspaces (invite + accept + revoke) and audit logs.
-- Extends RLS from owner-only to owner-or-accepted-collaborator on workspace content.

-- ---------------------------------------------------------------------------
-- Session helpers
-- ---------------------------------------------------------------------------
create or replace function public.plainsight_session_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.users u
  where u.id = public.plainsight_session_user_id()
  limit 1;
$$;

revoke all on function public.plainsight_session_user_email() from public;
grant execute on function public.plainsight_session_user_email() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Share rows
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_id uuid not null references public.users (id) on delete cascade,
  recipient_email text not null,
  recipient_user_id uuid null references public.users (id) on delete set null,
  workspace_name text not null default 'Workspace',
  owner_email text null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz null,
  revoked_at timestamptz null
);

create index if not exists workspace_shares_workspace_idx
  on public.workspace_shares (workspace_id);

create index if not exists workspace_shares_owner_idx
  on public.workspace_shares (owner_id);

create index if not exists workspace_shares_recipient_user_idx
  on public.workspace_shares (recipient_user_id);

create index if not exists workspace_shares_recipient_email_idx
  on public.workspace_shares (lower(recipient_email));

create unique index if not exists workspace_shares_workspace_recipient_active_uniq
  on public.workspace_shares (workspace_id, lower(recipient_email))
  where status in ('pending', 'accepted');

alter table public.workspace_shares enable row level security;

drop policy if exists "workspace_shares_select_visible_to_owner_or_recipient" on public.workspace_shares;
create policy "workspace_shares_select_visible_to_owner_or_recipient"
  on public.workspace_shares
  for select
  to anon, authenticated
  using (
    owner_id = public.plainsight_session_user_id()
    or recipient_user_id = public.plainsight_session_user_id()
    or lower(recipient_email) = lower(coalesce(public.plainsight_session_user_email(), ''))
  );

drop policy if exists "workspace_shares_insert_owner_only" on public.workspace_shares;
create policy "workspace_shares_insert_owner_only"
  on public.workspace_shares
  for insert
  to anon, authenticated
  with check (
    owner_id = public.plainsight_session_user_id()
    and exists (
      select 1
      from public.workspaces w
      where w.id = workspace_shares.workspace_id
        and w.owner_id = public.plainsight_session_user_id()
    )
  );

drop policy if exists "workspace_shares_update_owner_or_recipient" on public.workspace_shares;
create policy "workspace_shares_update_owner_or_recipient"
  on public.workspace_shares
  for update
  to anon, authenticated
  using (
    owner_id = public.plainsight_session_user_id()
    or recipient_user_id = public.plainsight_session_user_id()
    or lower(recipient_email) = lower(coalesce(public.plainsight_session_user_email(), ''))
  )
  with check (
    owner_id = public.plainsight_session_user_id()
    or recipient_user_id = public.plainsight_session_user_id()
    or lower(recipient_email) = lower(coalesce(public.plainsight_session_user_email(), ''))
  );

drop policy if exists "workspace_shares_delete_owner_only" on public.workspace_shares;
create policy "workspace_shares_delete_owner_only"
  on public.workspace_shares
  for delete
  to anon, authenticated
  using (owner_id = public.plainsight_session_user_id());

-- ---------------------------------------------------------------------------
-- Workspace content access helper: owner OR accepted collaborator
-- ---------------------------------------------------------------------------
create or replace function public.plainsight_workspace_has_access(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select public.plainsight_session_user_id() as uid,
      lower(coalesce(public.plainsight_session_user_email(), '')) as email
  )
  select exists (
    select 1
    from public.workspaces w
    join me on true
    where w.id = p_workspace_id
      and w.owner_id = me.uid
  )
  or exists (
    select 1
    from public.workspace_shares s
    join me on true
    where s.workspace_id = p_workspace_id
      and s.status = 'accepted'
      and s.revoked_at is null
      and (
        s.recipient_user_id = me.uid
        or lower(s.recipient_email) = me.email
      )
  );
$$;

revoke all on function public.plainsight_workspace_has_access(uuid) from public;
grant execute on function public.plainsight_workspace_has_access(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Audit logs
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_user_id uuid not null references public.users (id) on delete cascade,
  actor_email text null,
  action text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workspace_activity_logs_workspace_idx
  on public.workspace_activity_logs (workspace_id, created_at desc);

alter table public.workspace_activity_logs enable row level security;

drop policy if exists "workspace_activity_logs_select_shared_access" on public.workspace_activity_logs;
create policy "workspace_activity_logs_select_shared_access"
  on public.workspace_activity_logs
  for select
  to anon, authenticated
  using (public.plainsight_workspace_has_access(workspace_id));

drop policy if exists "workspace_activity_logs_insert_shared_access" on public.workspace_activity_logs;
create policy "workspace_activity_logs_insert_shared_access"
  on public.workspace_activity_logs
  for insert
  to anon, authenticated
  with check (
    actor_user_id = public.plainsight_session_user_id()
    and public.plainsight_workspace_has_access(workspace_id)
  );

-- ---------------------------------------------------------------------------
-- Shared-workspace RPCs
-- ---------------------------------------------------------------------------
create or replace function public.plainsight_share_workspace(
  p_workspace_id uuid,
  p_workspace_name text,
  p_recipient_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := public.plainsight_session_user_id();
  v_owner_email text := public.plainsight_session_user_email();
  v_recipient_email text := lower(trim(coalesce(p_recipient_email, '')));
  v_recipient_user_id uuid;
  v_share_id uuid;
begin
  if v_owner_id is null then
    raise exception 'not signed in';
  end if;

  if v_recipient_email = '' then
    raise exception 'recipient email required';
  end if;

  if not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_id = v_owner_id
  ) then
    raise exception 'workspace not owned by current user';
  end if;

  select u.id
  into v_recipient_user_id
  from public.users u
  where lower(u.email) = v_recipient_email
  limit 1;

  insert into public.workspace_shares (
    workspace_id,
    owner_id,
    recipient_email,
    recipient_user_id,
    workspace_name,
    owner_email,
    status,
    accepted_at,
    revoked_at,
    updated_at
  )
  values (
    p_workspace_id,
    v_owner_id,
    v_recipient_email,
    v_recipient_user_id,
    coalesce(nullif(trim(coalesce(p_workspace_name, '')), ''), 'Workspace'),
    v_owner_email,
    'pending',
    null,
    null,
    now()
  )
  on conflict (workspace_id, lower(recipient_email)) where status in ('pending', 'accepted')
  do update set
    recipient_user_id = excluded.recipient_user_id,
    workspace_name = excluded.workspace_name,
    owner_email = excluded.owner_email,
    status = 'pending',
    accepted_at = null,
    revoked_at = null,
    updated_at = now()
  returning id into v_share_id;

  insert into public.workspace_activity_logs (
    workspace_id,
    actor_user_id,
    actor_email,
    action,
    summary,
    details
  )
  values (
    p_workspace_id,
    v_owner_id,
    v_owner_email,
    'share_invited',
    format('Invited %s', v_recipient_email),
    jsonb_build_object(
      'recipient_email', v_recipient_email,
      'workspace_share_id', v_share_id
    )
  );

  return v_share_id;
end;
$$;

revoke all on function public.plainsight_share_workspace(uuid, text, text) from public;
grant execute on function public.plainsight_share_workspace(uuid, text, text) to anon, authenticated, service_role;

create or replace function public.plainsight_accept_workspace_share(p_share_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.plainsight_session_user_id();
  v_email text := lower(coalesce(public.plainsight_session_user_email(), ''));
  v_workspace_id uuid;
  v_workspace_name text;
  v_updated int := 0;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  update public.workspace_shares s
  set
    status = 'accepted',
    recipient_user_id = v_uid,
    accepted_at = now(),
    revoked_at = null,
    updated_at = now()
  where s.id = p_share_id
    and s.status = 'pending'
    and (
      s.recipient_user_id = v_uid
      or lower(s.recipient_email) = v_email
    )
  returning s.workspace_id, s.workspace_name
  into v_workspace_id, v_workspace_name;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  insert into public.workspace_activity_logs (
    workspace_id,
    actor_user_id,
    actor_email,
    action,
    summary,
    details
  )
  values (
    v_workspace_id,
    v_uid,
    public.plainsight_session_user_email(),
    'share_accepted',
    format('Accepted shared workspace %s', coalesce(v_workspace_name, 'Workspace')),
    jsonb_build_object('workspace_share_id', p_share_id)
  );

  return true;
end;
$$;

revoke all on function public.plainsight_accept_workspace_share(uuid) from public;
grant execute on function public.plainsight_accept_workspace_share(uuid) to anon, authenticated, service_role;

create or replace function public.plainsight_make_workspace_private(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.plainsight_session_user_id();
  v_email text := public.plainsight_session_user_email();
  v_revoked int := 0;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  if not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_id = v_uid
  ) then
    raise exception 'workspace not owned by current user';
  end if;

  update public.workspace_shares s
  set
    status = 'revoked',
    revoked_at = now(),
    updated_at = now()
  where s.workspace_id = p_workspace_id
    and s.owner_id = v_uid
    and s.status in ('pending', 'accepted');

  get diagnostics v_revoked = row_count;

  if v_revoked > 0 then
    insert into public.workspace_activity_logs (
      workspace_id,
      actor_user_id,
      actor_email,
      action,
      summary,
      details
    )
    values (
      p_workspace_id,
      v_uid,
      v_email,
      'workspace_private',
      format('Made workspace private (%s revoked)', v_revoked),
      jsonb_build_object('revoked_count', v_revoked)
    );
  end if;

  return v_revoked;
end;
$$;

revoke all on function public.plainsight_make_workspace_private(uuid) from public;
grant execute on function public.plainsight_make_workspace_private(uuid) to anon, authenticated, service_role;

create or replace function public.plainsight_log_workspace_activity(
  p_workspace_id uuid,
  p_action text,
  p_summary text,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.plainsight_session_user_id();
  v_email text := public.plainsight_session_user_email();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if not public.plainsight_workspace_has_access(p_workspace_id) then
    raise exception 'workspace access denied';
  end if;
  if trim(coalesce(p_action, '')) = '' then
    raise exception 'action required';
  end if;
  if trim(coalesce(p_summary, '')) = '' then
    raise exception 'summary required';
  end if;

  insert into public.workspace_activity_logs (
    workspace_id,
    actor_user_id,
    actor_email,
    action,
    summary,
    details
  )
  values (
    p_workspace_id,
    v_uid,
    v_email,
    trim(p_action),
    left(trim(p_summary), 500),
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.plainsight_log_workspace_activity(uuid, text, text, jsonb) from public;
grant execute on function public.plainsight_log_workspace_activity(uuid, text, text, jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Workspace/content RLS: owner OR accepted collaborator
-- ---------------------------------------------------------------------------
drop policy if exists "workspaces_owner_all" on public.workspaces;
drop policy if exists "workspaces_owner_or_share_select" on public.workspaces;
drop policy if exists "workspaces_owner_insert" on public.workspaces;
drop policy if exists "workspaces_owner_update" on public.workspaces;
drop policy if exists "workspaces_owner_delete" on public.workspaces;

create policy "workspaces_owner_or_share_select"
  on public.workspaces
  for select
  to anon, authenticated
  using (
    owner_id = public.plainsight_session_user_id()
    or exists (
      select 1
      from public.workspace_shares s
      where s.workspace_id = workspaces.id
        and s.status = 'accepted'
        and s.revoked_at is null
        and (
          s.recipient_user_id = public.plainsight_session_user_id()
          or lower(s.recipient_email) = lower(coalesce(public.plainsight_session_user_email(), ''))
        )
    )
  );

create policy "workspaces_owner_insert"
  on public.workspaces
  for insert
  to anon, authenticated
  with check (owner_id = public.plainsight_session_user_id());

create policy "workspaces_owner_update"
  on public.workspaces
  for update
  to anon, authenticated
  using (owner_id = public.plainsight_session_user_id())
  with check (owner_id = public.plainsight_session_user_id());

create policy "workspaces_owner_delete"
  on public.workspaces
  for delete
  to anon, authenticated
  using (owner_id = public.plainsight_session_user_id());

drop policy if exists "categories_workspace_owner_all" on public.categories;
create policy "categories_workspace_owner_or_share_all"
  on public.categories
  for all
  to anon, authenticated
  using (public.plainsight_workspace_has_access(categories.workspace_id))
  with check (public.plainsight_workspace_has_access(categories.workspace_id));

drop policy if exists "notes_workspace_owner_all" on public.notes;
create policy "notes_workspace_owner_or_share_all"
  on public.notes
  for all
  to anon, authenticated
  using (public.plainsight_workspace_has_access(notes.workspace_id))
  with check (public.plainsight_workspace_has_access(notes.workspace_id));

drop policy if exists "archived_notes_workspace_owner_all" on public.archived_notes;
create policy "archived_notes_workspace_owner_or_share_all"
  on public.archived_notes
  for all
  to anon, authenticated
  using (public.plainsight_workspace_has_access(archived_notes.workspace_id))
  with check (public.plainsight_workspace_has_access(archived_notes.workspace_id));

drop policy if exists "note_tags_workspace_owner_all" on public.note_tags;
create policy "note_tags_workspace_owner_or_share_all"
  on public.note_tags
  for all
  to anon, authenticated
  using (public.plainsight_workspace_has_access(note_tags.workspace_id))
  with check (public.plainsight_workspace_has_access(note_tags.workspace_id));

drop policy if exists "archived_note_tags_workspace_owner_all" on public.archived_note_tags;
create policy "archived_note_tags_workspace_owner_or_share_all"
  on public.archived_note_tags
  for all
  to anon, authenticated
  using (public.plainsight_workspace_has_access(archived_note_tags.workspace_id))
  with check (public.plainsight_workspace_has_access(archived_note_tags.workspace_id));

drop policy if exists "workspace_pins_user_all" on public.workspace_pins;
create policy "workspace_pins_user_shared_access_all"
  on public.workspace_pins
  for all
  to anon, authenticated
  using (
    user_id = public.plainsight_session_user_id()
    and public.plainsight_workspace_has_access(workspace_id)
  )
  with check (
    user_id = public.plainsight_session_user_id()
    and public.plainsight_workspace_has_access(workspace_id)
  );
