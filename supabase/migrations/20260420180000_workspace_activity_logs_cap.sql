-- Cap workspace_activity_logs at 100 rows per workspace (purge oldest).

create or replace function public.plainsight_enforce_workspace_activity_log_cap(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_excess int;
begin
  if p_workspace_id is null then
    return;
  end if;

  select (count(*) - 100)::int into v_excess
  from public.workspace_activity_logs
  where workspace_id = p_workspace_id;

  if v_excess > 0 then
    delete from public.workspace_activity_logs l
    using (
      select wal.id
      from public.workspace_activity_logs wal
      where wal.workspace_id = p_workspace_id
      order by wal.created_at asc, wal.id asc
      limit v_excess
    ) d
    where l.id = d.id;
  end if;
end;
$$;

revoke all on function public.plainsight_enforce_workspace_activity_log_cap(uuid) from public;
grant execute on function public.plainsight_enforce_workspace_activity_log_cap(uuid) to service_role;

create or replace function public.plainsight_trim_workspace_activity_logs_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.plainsight_enforce_workspace_activity_log_cap(new.workspace_id);
  return new;
end;
$$;

revoke all on function public.plainsight_trim_workspace_activity_logs_after_insert() from public;

drop trigger if exists workspace_activity_logs_cap_after_insert on public.workspace_activity_logs;

create trigger workspace_activity_logs_cap_after_insert
  after insert on public.workspace_activity_logs
  for each row
  execute procedure public.plainsight_trim_workspace_activity_logs_after_insert();
