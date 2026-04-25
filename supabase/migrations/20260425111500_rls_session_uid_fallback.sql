-- Realtime compatibility:
-- Our PostgREST requests authenticate via `x-plainsight-session` (custom session token),
-- but Realtime `postgres_changes` uses JWT auth (`auth.uid()`, `auth.jwt()`).
-- Make the session helper functions work in both contexts by falling back to JWT.

create or replace function public.plainsight_session_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.user_id
      from public.sessions s
      where s.id = nullif(
        trim(coalesce((current_setting('request.headers', true)::json ->> 'x-plainsight-session'), '')),
        ''
      )
        and s.expires_at > now()
      limit 1
    ),
    auth.uid()
  );
$$;

revoke all on function public.plainsight_session_user_id() from public;
grant execute on function public.plainsight_session_user_id() to anon, authenticated, service_role;

create or replace function public.plainsight_session_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select u.email
      from public.users u
      where u.id = public.plainsight_session_user_id()
      limit 1
    ),
    nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '')
  );
$$;

revoke all on function public.plainsight_session_user_email() from public;
grant execute on function public.plainsight_session_user_email() to anon, authenticated, service_role;

