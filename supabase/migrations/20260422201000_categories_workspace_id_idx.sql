-- Speed up category pulls/filters by workspace during sync.

create index if not exists categories_workspace_id_idx
  on public.categories (workspace_id);
