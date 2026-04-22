-- Deterministic note deletes under custom session auth.
-- PostgREST DELETE can return 200 + 0 rows both for "already deleted" and for RLS-hidden rows.
-- This RPC performs an explicit access check then deletes scoped to workspace_id.

create or replace function public.plainsight_delete_notes(
  p_workspace_id uuid,
  p_note_ids uuid[]
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.plainsight_session_user_id() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  if not public.plainsight_workspace_has_access(p_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  delete from public.notes n
  where n.workspace_id = p_workspace_id
    and n.id = any(p_note_ids)
  returning n.id;
end;
$$;

revoke all on function public.plainsight_delete_notes(uuid,uuid[]) from public;
grant execute on function public.plainsight_delete_notes(uuid,uuid[]) to anon, authenticated, service_role;

