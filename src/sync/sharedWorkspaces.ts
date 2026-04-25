import { getSession as getLocalSession } from '../auth/localSession';
import { getCanUseSupabase } from './syncEnabled';
import { getSupabase } from './supabaseClient';
import type { WorkspaceActivityLog, WorkspaceShare, WorkspaceShareStatus } from './types';
import { readAuthDisplayEmail } from '../auth/authDisplayEmail';

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  const v = normalizeEmail(email);
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function hasPaidSyncSession(): boolean {
  return getCanUseSupabase();
}

function currentUserId(): string | null {
  return getLocalSession().userId ?? null;
}

function currentUserEmail(): string | null {
  const email = normalizeEmail(readAuthDisplayEmail() || '');
  return email || null;
}

function err(message: string, details?: unknown) {
  return { message, details };
}

function safeStatus(v: unknown): WorkspaceShareStatus {
  return v === 'accepted' || v === 'revoked' ? v : 'pending';
}

function toWorkspaceShare(row: any): WorkspaceShare {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    owner_id: String(row.owner_id),
    recipient_email: String(row.recipient_email || '').toLowerCase(),
    recipient_user_id:
      typeof row.recipient_user_id === 'string' ? row.recipient_user_id : null,
    workspace_name: String(row.workspace_name || 'Workspace'),
    owner_email: row.owner_email ? String(row.owner_email) : null,
    status: safeStatus(row.status),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
    accepted_at: row.accepted_at ? String(row.accepted_at) : null,
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
  };
}

function toWorkspaceActivityLog(row: any): WorkspaceActivityLog {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    actor_user_id: String(row.actor_user_id),
    actor_email: row.actor_email ? String(row.actor_email) : null,
    action: String(row.action || ''),
    summary: String(row.summary || ''),
    details:
      row.details && typeof row.details === 'object' ? row.details : {},
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export async function listWorkspaceShares() {
  if (!hasPaidSyncSession()) return { data: [] as WorkspaceShare[] };
  try {
    const { data, error } = await getSupabase()
      .from('workspace_shares')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) return { data: [] as WorkspaceShare[], error: err(error.message, error) };
    return { data: (data || []).map(toWorkspaceShare) };
  } catch (e) {
    return { data: [] as WorkspaceShare[], error: err('Failed to list shared workspaces', e) };
  }
}

export async function shareWorkspaceByEmail(
  workspaceId: string,
  workspaceName: string,
  recipientEmail: string,
) {
  if (!hasPaidSyncSession()) {
    return { ok: false, error: err('Cloud sync is required to share workspaces') };
  }
  const email = normalizeEmail(recipientEmail);
  if (!isValidEmail(email)) {
    return { ok: false, error: err('Enter a valid email address') };
  }
  try {
    const { error } = await getSupabase().rpc('plainsight_share_workspace', {
      p_workspace_id: workspaceId,
      p_workspace_name: workspaceName,
      p_recipient_email: email,
    });
    if (error) return { ok: false, error: err(error.message, error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err('Failed to share workspace', e) };
  }
}

export async function acceptWorkspaceShare(shareId: string) {
  if (!hasPaidSyncSession()) {
    return { ok: false, error: err('Cloud sync is required to accept shared workspaces') };
  }
  try {
    const { data, error } = await getSupabase().rpc(
      'plainsight_accept_workspace_share',
      {
        p_share_id: shareId,
      },
    );
    if (error) return { ok: false, error: err(error.message, error) };
    if (data !== true) return { ok: false, error: err('Share is no longer available') };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err('Failed to accept workspace share', e) };
  }
}

export async function makeWorkspacePrivate(workspaceId: string) {
  if (!hasPaidSyncSession()) {
    return { ok: false, revokedCount: 0, error: err('Cloud sync is required') };
  }
  try {
    const { data, error } = await getSupabase().rpc(
      'plainsight_make_workspace_private',
      {
        p_workspace_id: workspaceId,
      },
    );
    if (error) return { ok: false, revokedCount: 0, error: err(error.message, error) };
    const revokedCount = Number.isFinite(Number(data)) ? Number(data) : 0;
    return { ok: true, revokedCount };
  } catch (e) {
    return { ok: false, revokedCount: 0, error: err('Failed to make workspace private', e) };
  }
}

/**
 * `workspace_shares.workspace_name` is a snapshot used for menu display on new devices.
 * Keep it in sync when the owner renames a workspace, so share menus don't briefly show
 * an older name before workspace rows hydrate.
 */
export async function updateSharedWorkspaceNameSnapshot(
  workspaceId: string,
  workspaceName: string,
) {
  if (!hasPaidSyncSession()) return { ok: true };
  const wid = String(workspaceId || '').trim();
  const name = String(workspaceName || '').trim();
  if (!wid || !name) return { ok: true };
  try {
    const { error } = await getSupabase()
      .from('workspace_shares')
      .update({ workspace_name: name })
      .eq('workspace_id', wid);
    if (error) return { ok: false, error: err(error.message, error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err('Failed to update shared workspace name', e) };
  }
}

export async function fetchWorkspaceActivityLogs(
  workspaceId: string,
  limit = 60,
) {
  if (!hasPaidSyncSession()) return { data: [] as WorkspaceActivityLog[] };
  try {
    const { data, error } = await getSupabase()
      .from('workspace_activity_logs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(200, limit)));
    if (error) return { data: [] as WorkspaceActivityLog[], error: err(error.message, error) };
    return { data: (data || []).map(toWorkspaceActivityLog) };
  } catch (e) {
    return { data: [] as WorkspaceActivityLog[], error: err('Failed to fetch workspace logs', e) };
  }
}

export function subscribeToWorkspaceShares(onChange: () => void) {
  if (!hasPaidSyncSession()) return () => {};
  const sb = getSupabase();
  const channel = sb
    .channel('workspace_shares')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workspace_shares' },
      () => {
        try {
          onChange();
        } catch {
          /* ignore */
        }
      },
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

export function subscribeToWorkspaceActivityLogs(
  workspaceId: string,
  onChange: () => void,
) {
  if (!hasPaidSyncSession() || !workspaceId) return () => {};
  const sb = getSupabase();
  const channel = sb
    .channel(`workspace_activity_logs:${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'workspace_activity_logs',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      () => {
        try {
          onChange();
        } catch {
          /* ignore */
        }
      },
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

export async function logWorkspaceActivity(
  workspaceId: string,
  action: string,
  summary: string,
  details: Record<string, unknown> = {},
) {
  if (!hasPaidSyncSession()) return { ok: true };
  try {
    const { error } = await getSupabase().rpc('plainsight_log_workspace_activity', {
      p_workspace_id: workspaceId,
      p_action: action,
      p_summary: summary,
      p_details: details,
    });
    if (error) return { ok: false, error: err(error.message, error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err('Failed to log activity', e) };
  }
}

export type SharedWorkspaceMenuRow = {
  workspaceId: string;
  workspaceName: string;
  ownerId: string;
  ownerEmail: string | null;
  acceptedShareIds: string[];
  acceptedCollaborators: string[];
  isOwner: boolean;
};

export type PendingWorkspaceInviteRow = {
  shareId: string;
  workspaceId: string;
  workspaceName: string;
  ownerEmail: string | null;
  recipientEmail: string;
};

type BuildRowsOpts = {
  shares: WorkspaceShare[];
  workspaceNamesById?: Map<string, string>;
};

export function buildSharedWorkspaceRows(opts: BuildRowsOpts): {
  acceptedRows: SharedWorkspaceMenuRow[];
  pendingRows: PendingWorkspaceInviteRow[];
} {
  const myId = currentUserId();
  const myEmail = currentUserEmail();
  const nameById = opts.workspaceNamesById || new Map<string, string>();
  const acceptedByWorkspace = new Map<string, SharedWorkspaceMenuRow>();
  const pendingRows: PendingWorkspaceInviteRow[] = [];
  const acceptedOwnerWorkspaceIds = new Set<string>();

  const shares = Array.isArray(opts.shares) ? opts.shares : [];

  for (const s of shares) {
    if (s.status !== 'accepted') continue;
    if (myId == null) continue;
    if (s.owner_id !== myId) continue;
    acceptedOwnerWorkspaceIds.add(String(s.workspace_id));
  }

  for (const s of shares) {
    const workspaceName =
      nameById.get(s.workspace_id) || s.workspace_name || 'Shared workspace';

    const acceptedForMe =
      s.status === 'accepted' &&
      myId != null &&
      (s.owner_id === myId ||
        s.recipient_user_id === myId ||
        (myEmail != null &&
          normalizeEmail(s.recipient_email) === normalizeEmail(myEmail)) ||
        acceptedOwnerWorkspaceIds.has(String(s.workspace_id)));

    if (acceptedForMe) {
      let row = acceptedByWorkspace.get(s.workspace_id);
      if (!row) {
        row = {
          workspaceId: s.workspace_id,
          workspaceName,
          ownerId: s.owner_id,
          ownerEmail: s.owner_email ?? null,
          acceptedShareIds: [],
          acceptedCollaborators: [],
          isOwner: s.owner_id === myId,
        };
        acceptedByWorkspace.set(s.workspace_id, row);
      }
      row.acceptedShareIds.push(s.id);
      if (s.recipient_email && s.owner_id === myId) {
        row.acceptedCollaborators.push(String(s.recipient_email).toLowerCase());
      }
      continue;
    }

    const pendingForMe =
      s.status === 'pending' &&
      myId != null &&
      s.owner_id !== myId &&
      (s.recipient_user_id === myId ||
        (myEmail != null &&
          normalizeEmail(s.recipient_email) === normalizeEmail(myEmail)));
    if (pendingForMe) {
      pendingRows.push({
        shareId: s.id,
        workspaceId: s.workspace_id,
        workspaceName,
        ownerEmail: s.owner_email ?? null,
        recipientEmail: s.recipient_email,
      });
    }
  }

  const acceptedRows = [...acceptedByWorkspace.values()].map((row) => ({
    ...row,
    acceptedCollaborators: [...new Set(row.acceptedCollaborators)].sort(),
  }));
  acceptedRows.sort((a, b) =>
    a.workspaceName.localeCompare(b.workspaceName, undefined, {
      sensitivity: 'base',
    }),
  );
  pendingRows.sort((a, b) =>
    a.workspaceName.localeCompare(b.workspaceName, undefined, {
      sensitivity: 'base',
    }),
  );
  return { acceptedRows, pendingRows };
}

