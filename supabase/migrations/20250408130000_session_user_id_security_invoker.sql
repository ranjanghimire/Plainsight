-- plainsight_session_user_id was SECURITY DEFINER. PostgREST sets request.headers
-- on the request scope; that GUC is often not visible inside SECURITY DEFINER, so
-- the helper returned NULL, SELECTs saw no rows (no error), and INSERT/UPSERT RLS
-- failed with 42501. INVOKER keeps the request context; sessions RLS still allows
-- reads for the same x-plainsight-session token used in the WHERE clause.

create or replace function public.plainsight_session_user_id()
returns uuid
language sql
stable
security invoker
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
