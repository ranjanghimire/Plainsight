-- Holistic read-path indexes for Plainsight sync + sharing (additive, IF NOT EXISTS).
-- RLS still evaluates per row; good indexes keep filter/sort/join plans cheap as data grows.

-- ---------------------------------------------------------------------------
-- workspace_pins: fetch is scoped to current user + ordered by position
-- (see supabaseClient.fetchWorkspacePins + RLS user_id = session user).
-- ---------------------------------------------------------------------------
create index if not exists workspace_pins_user_id_position_idx
  on public.workspace_pins (user_id, position asc);

-- ---------------------------------------------------------------------------
-- workspace_shares: listWorkspaceShares() selects visible rows ORDER BY updated_at DESC.
-- Partial composites help owner vs recipient branches under OR RLS.
-- ---------------------------------------------------------------------------
create index if not exists workspace_shares_owner_id_updated_at_idx
  on public.workspace_shares (owner_id, updated_at desc);

create index if not exists workspace_shares_recipient_user_updated_at_idx
  on public.workspace_shares (recipient_user_id, updated_at desc)
  where recipient_user_id is not null;
