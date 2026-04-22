-- Client-reported runtime errors (sanitized in the app before insert).
-- RLS: insert only when x-plainsight-session resolves to a user; user_id is set in a trigger.
-- Reads: use service role or SQL editor — no select policy for anon/authenticated.

create table if not exists public.errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  type text not null,
  message text not null,
  stack text,
  app_version text,
  platform text,
  route text,
  created_at timestamptz not null default now(),
  constraint errors_type_len check (char_length(type) <= 80),
  constraint errors_message_len check (char_length(message) <= 4000),
  constraint errors_stack_len check (stack is null or char_length(stack) <= 32000),
  constraint errors_platform_len check (platform is null or char_length(platform) <= 260),
  constraint errors_route_len check (route is null or char_length(route) <= 512),
  constraint errors_app_version_len check (app_version is null or char_length(app_version) <= 160)
);

create index if not exists errors_created_at_idx on public.errors (created_at desc);

alter table public.errors enable row level security;

create or replace function public.errors_set_user_id_from_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := public.plainsight_session_user_id();
  if new.user_id is null then
    raise exception 'errors insert requires valid plainsight session'
      using errcode = '28000';
  end if;
  return new;
end;
$$;

revoke all on function public.errors_set_user_id_from_session() from public;
grant execute on function public.errors_set_user_id_from_session() to anon, authenticated, service_role;

drop trigger if exists errors_set_user on public.errors;
create trigger errors_set_user
  before insert on public.errors
  for each row execute procedure public.errors_set_user_id_from_session();

drop policy if exists errors_insert_session on public.errors;
create policy errors_insert_session
  on public.errors
  for insert
  to anon, authenticated
  with check (public.plainsight_session_user_id() is not null);
