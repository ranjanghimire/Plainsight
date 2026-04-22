-- Drop legacy / duplicate btree indexes superseded by newer composites or uniques.
-- Reduces write amplification and storage; query plans use the remaining indexes.

-- users: unique on email already implies an index (users_email_key)
drop index if exists public.users_email_idx;

-- workspaces: keep workspaces_owner_id_idx (same as idx_workspaces_owner)
drop index if exists public.idx_workspaces_owner;

-- categories: keep categories_workspace_id_created_at_id_idx + categories_workspace_id_name_key
drop index if exists public.idx_categories_workspace;
drop index if exists public.categories_workspace_id_idx;

-- notes / archived_notes: workspace-leading composites cover workspace_id-only filters
drop index if exists public.idx_notes_workspace;
drop index if exists public.idx_archived_workspace;

-- workspace_pins: PK (user_id, workspace_id) leads on user_id for user-scoped scans
drop index if exists public.idx_workspace_pins_user;
