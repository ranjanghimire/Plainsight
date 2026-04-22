-- Speed up workspace list + access checks used by RLS helpers during sync/realtime.
-- These are safe additive indexes (IF NOT EXISTS).

create index if not exists workspace_shares_recipient_user_status_idx
  on public.workspace_shares (recipient_user_id, status)
  where revoked_at is null;

create index if not exists workspace_shares_recipient_email_status_idx
  on public.workspace_shares (lower(recipient_email), status)
  where revoked_at is null;

create index if not exists workspace_shares_workspace_status_idx
  on public.workspace_shares (workspace_id, status)
  where revoked_at is null;

create index if not exists workspaces_owner_id_idx
  on public.workspaces (owner_id);
