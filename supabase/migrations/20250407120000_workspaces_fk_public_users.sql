-- PlainSight uses custom OTP users in public.users, not Supabase Auth (auth.users).
-- 1) Remove rows tied to workspace owner_ids that do not exist in public.users (legacy auth
--    IDs, tests, etc.). Otherwise ADD CONSTRAINT ... REFERENCES public.users fails with 23503.
-- 2) Repoint FKs to public.users.

-- Children first: anything keyed by workspace_id on a doomed workspace
delete from public.workspace_pins p
where exists (
  select 1 from public.workspaces w
  where w.id = p.workspace_id
    and not exists (select 1 from public.users u where u.id = w.owner_id)
);

delete from public.archived_notes a
where exists (
  select 1 from public.workspaces w
  where w.id = a.workspace_id
    and not exists (select 1 from public.users u where u.id = w.owner_id)
);

delete from public.notes n
where exists (
  select 1 from public.workspaces w
  where w.id = n.workspace_id
    and not exists (select 1 from public.users u where u.id = w.owner_id)
);

delete from public.categories c
where exists (
  select 1 from public.workspaces w
  where w.id = c.workspace_id
    and not exists (select 1 from public.users u where u.id = w.owner_id)
);

delete from public.workspaces w
where not exists (select 1 from public.users u where u.id = w.owner_id);

-- Pins whose user_id is not a custom user (e.g. old auth linkage)
delete from public.workspace_pins p
where not exists (select 1 from public.users u where u.id = p.user_id);

-- FKs → public.users
alter table public.workspaces
  drop constraint if exists workspaces_owner_id_fkey;

alter table public.workspaces
  add constraint workspaces_owner_id_fkey
  foreign key (owner_id) references public.users (id) on delete cascade;

do $$
begin
  if to_regclass('public.workspace_pins') is not null then
    execute 'alter table public.workspace_pins drop constraint if exists workspace_pins_user_id_fkey';
    execute
      'alter table public.workspace_pins add constraint workspace_pins_user_id_fkey '
      || 'foreign key (user_id) references public.users (id) on delete cascade';
  end if;
end $$;
