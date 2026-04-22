-- Speed up chunked fullSync pulls: eq(workspace_id) + order by time + id (PostgREST range).

create index if not exists notes_workspace_id_updated_at_id_idx
  on public.notes (workspace_id, updated_at desc, id desc);

create index if not exists archived_notes_workspace_id_last_deleted_id_idx
  on public.archived_notes (workspace_id, last_deleted_at desc, id desc);

create index if not exists categories_workspace_id_created_at_id_idx
  on public.categories (workspace_id, created_at asc, id asc);
