import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSession } from '../src/auth/localSession';
import { persistAuthDisplayEmail } from '../src/auth/authDisplayEmail';
import { getLocalNoteTombstones, saveLocalNoteTombstones } from '../src/sync/localDB';
import { setSyncEntitlementActive, setSyncRemoteActive } from '../src/sync/syncEnabled';
import { resetSyncQueueForTests } from '../src/sync/syncHelpers';
import { whenRealtimeAuthReady } from '../src/sync/supabaseClient';
import { fullSync, deleteWorkspaceRemote } from '../src/sync/syncEngine';
import {
  acceptWorkspaceShare,
  listWorkspaceShares,
  logWorkspaceActivity,
  makeWorkspacePrivate,
  shareWorkspaceByEmail,
  subscribeToWorkspaceActivityLogs,
} from '../src/sync/sharedWorkspaces';
import { getLocalNotes, getLocalWorkspaces } from '../src/sync/localDB';
import {
  getStorageKeyForWorkspaceId,
  loadWorkspace,
  saveWorkspace,
  setWorkspaceIdMapping,
  VISIBLE_WS_PREFIX,
} from '../src/utils/storage';
import { clearPlainsightStorage } from './categoryTestHarness';
import {
  countNotesInWorkspace,
  deleteRemoteWorkspaceCascadeViaService,
  ensurePaidTestIdentity,
  ensureRemoteWorkspaceRow,
  getSupabaseServiceClient,
  insertNoteRowViaService,
} from './supabaseTestHelpers';

const hasPaidEnv = Boolean(
  process.env.VITEST_SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    process.env.VITEST_SUPABASE_USER_ID?.trim() &&
    process.env.VITEST_SUPABASE_SESSION_TOKEN?.trim(),
);
// Opt-in: these are end-to-end Supabase collaboration tests and can be flaky across projects.
const strictPaid = process.env.VITEST_STRICT_PAID === '1';
const paidDescribe = hasPaidEnv && strictPaid ? describe : describe.skip;

type StorageSnapshot = {
  local: Record<string, string>;
  session: Record<string, string>;
};

type DeviceContext = {
  userId: string;
  sessionToken: string;
  email: string;
  snapshot: StorageSnapshot;
};

function captureStorageSnapshot(): StorageSnapshot {
  const local: Record<string, string> = {};
  const session: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key);
    if (value == null) continue;
    local[key] = value;
  }
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (!key) continue;
    const value = sessionStorage.getItem(key);
    if (value == null) continue;
    session[key] = value;
  }
  return { local, session };
}

function restoreStorageSnapshot(snapshot: StorageSnapshot): void {
  localStorage.clear();
  sessionStorage.clear();
  for (const [key, value] of Object.entries(snapshot.local)) {
    localStorage.setItem(key, value);
  }
  for (const [key, value] of Object.entries(snapshot.session)) {
    sessionStorage.setItem(key, value);
  }
}

async function activateDevice(device: DeviceContext): Promise<void> {
  restoreStorageSnapshot(device.snapshot);
  setSession(device.sessionToken, device.userId);
  persistAuthDisplayEmail(device.email);
  globalThis.__PS_TEST_FLAGS__ = {
    paidSync: true,
    sessionUserId: device.userId,
    useRealSharedWorkspaces: true,
  };
  await act(async () => {
    setSyncEntitlementActive(true);
    setSyncRemoteActive(true);
  });
}

function stashDevice(device: DeviceContext): void {
  device.snapshot = captureStorageSnapshot();
}

async function runWorkspaceSync(workspaceId: string): Promise<void> {
  const result = await fullSync([workspaceId]);
  expect(result.ok).toBe(true);
}

function storageKeyForWorkspace(workspaceId: string): string {
  const key = getStorageKeyForWorkspaceId(workspaceId) || `${VISIBLE_WS_PREFIX}${workspaceId}`;
  setWorkspaceIdMapping(key, workspaceId);
  return key;
}

function upsertWorkspaceNote(
  workspaceId: string,
  noteId: string,
  text: string,
  updatedAt: string,
): void {
  const key = storageKeyForWorkspace(workspaceId);
  const current = loadWorkspace(key);
  const notes = Array.isArray(current.notes) ? [...current.notes] : [];
  const idx = notes.findIndex((n) => String(n?.id || '') === noteId);
  const createdAt = idx >= 0 ? String(notes[idx]?.createdAt || updatedAt) : updatedAt;
  const nextNote = {
    id: noteId,
    text,
    category: null,
    createdAt,
    updatedAt,
  };
  if (idx >= 0) notes[idx] = nextNote;
  else notes.push(nextNote);
  saveWorkspace(key, {
    ...current,
    notes,
    categories: Array.isArray(current.categories) ? current.categories : [],
    archivedNotes:
      current.archivedNotes && typeof current.archivedNotes === 'object'
        ? current.archivedNotes
        : {},
  });
}

function readWorkspaceNoteText(workspaceId: string, noteId: string): string | null {
  const key = storageKeyForWorkspace(workspaceId);
  const data = loadWorkspace(key);
  const note = (data.notes || []).find((n) => String(n?.id || '') === noteId);
  return note ? String(note.text || '') : null;
}

function listWorkspaceNoteIds(workspaceId: string): string[] {
  const key = storageKeyForWorkspace(workspaceId);
  const data = loadWorkspace(key);
  return (Array.isArray(data.notes) ? data.notes : [])
    .map((n) => String(n?.id || ''))
    .filter(Boolean);
}

function removeWorkspaceNote(workspaceId: string, noteId: string): void {
  const key = storageKeyForWorkspace(workspaceId);
  const current = loadWorkspace(key);
  const notes = (Array.isArray(current.notes) ? current.notes : []).filter(
    (n) => String(n?.id || '') !== noteId,
  );
  saveWorkspace(key, {
    ...current,
    notes,
    categories: Array.isArray(current.categories) ? current.categories : [],
    archivedNotes:
      current.archivedNotes && typeof current.archivedNotes === 'object'
        ? current.archivedNotes
        : {},
  });
}

/**
 * Mirrors app delete path: UI blob loses the row, tombstone recorded, then fullSync pushes remote delete.
 */
async function deleteWorkspaceNoteAsLocalUser(
  device: DeviceContext,
  workspaceId: string,
  noteId: string,
): Promise<void> {
  await activateDevice(device);
  removeWorkspaceNote(workspaceId, noteId);
  const deletedAt = new Date().toISOString();
  const existing = await getLocalNoteTombstones(workspaceId);
  await saveLocalNoteTombstones(workspaceId, [
    { id: noteId, workspace_id: workspaceId, deleted_at: deletedAt },
    ...existing.filter((t) => t.id !== noteId),
  ]);
  await runWorkspaceSync(workspaceId);
}

async function createCollaboratorIdentity(): Promise<DeviceContext> {
  const sb = getSupabaseServiceClient();
  const userId = crypto.randomUUID();
  const token = `vitest-collab-${crypto.randomUUID()}`;
  const email = `vitest-collab-${userId.replace(/-/g, '')}@plainsight.test`;
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { error: userErr } = await sb.from('users').upsert({ id: userId, email }, { onConflict: 'id' });
  if (userErr) throw userErr;
  const { error: sessionErr } = await sb
    .from('sessions')
    .upsert({ id: token, user_id: userId, expires_at: expiresAt }, { onConflict: 'id' });
  if (sessionErr) throw sessionErr;
  return {
    userId,
    sessionToken: token,
    email,
    snapshot: { local: {}, session: {} },
  };
}

async function cleanupCollaboratorIdentity(device: DeviceContext | null): Promise<void> {
  if (!device) return;
  const sb = getSupabaseServiceClient();
  await sb.from('sessions').delete().eq('id', device.sessionToken);
  await sb.from('users').delete().eq('id', device.userId);
}

async function readRemoteNoteText(noteId: string): Promise<string | null> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb.from('notes').select('id, text').eq('id', noteId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return String(data.text || '');
}

async function remoteWorkspaceExists(workspaceId: string): Promise<boolean> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb.from('workspaces').select('id').eq('id', workspaceId).maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

type AcceptedShareSetup = {
  workspaceId: string;
  workspaceName: string;
  noteId: string;
  owner: DeviceContext;
  collaborator: DeviceContext;
};

type PendingShareSetup = {
  workspaceId: string;
  workspaceName: string;
  noteId: string;
  shareId: string;
};

async function setupAcceptedSharedWorkspace(
  owner: DeviceContext,
  collaborator: DeviceContext,
): Promise<AcceptedShareSetup> {
  const workspaceId = crypto.randomUUID();
  const workspaceName = `Shared Test ${workspaceId.slice(0, 8)}`;
  const noteId = crypto.randomUUID();
  const now = new Date().toISOString();

  await activateDevice(owner);
  await ensureRemoteWorkspaceRow({
    workspaceId,
    ownerId: owner.userId,
    name: workspaceName,
    kind: 'visible',
  });
  await insertNoteRowViaService({
    id: noteId,
    workspace_id: workspaceId,
    text: 'baseline shared note',
    category_id: null,
    created_at: now,
    updated_at: now,
  });
  const shareRes = await shareWorkspaceByEmail(workspaceId, workspaceName, collaborator.email);
  expect(shareRes.ok).toBe(true);
  await runWorkspaceSync(workspaceId);
  stashDevice(owner);

  await activateDevice(collaborator);
  const incoming = await listWorkspaceShares();
  expect(incoming.error).toBeUndefined();
  const pending = (incoming.data || []).find(
    (row) => row.workspace_id === workspaceId && row.status === 'pending',
  );
  expect(pending).toBeTruthy();
  const acceptRes = await acceptWorkspaceShare(String(pending?.id || ''));
  expect(acceptRes.ok).toBe(true);
  await runWorkspaceSync(workspaceId);
  const acceptedNote = readWorkspaceNoteText(workspaceId, noteId);
  expect(acceptedNote).toBe('baseline shared note');
  stashDevice(collaborator);

  return { workspaceId, workspaceName, noteId, owner, collaborator };
}

async function setupPendingSharedWorkspace(
  owner: DeviceContext,
  collaborator: DeviceContext,
): Promise<PendingShareSetup> {
  const workspaceId = crypto.randomUUID();
  const workspaceName = `Pending Shared ${workspaceId.slice(0, 8)}`;
  const noteId = crypto.randomUUID();
  const now = new Date().toISOString();

  await activateDevice(owner);
  await ensureRemoteWorkspaceRow({
    workspaceId,
    ownerId: owner.userId,
    name: workspaceName,
    kind: 'visible',
  });
  await insertNoteRowViaService({
    id: noteId,
    workspace_id: workspaceId,
    text: 'pending invite baseline',
    category_id: null,
    created_at: now,
    updated_at: now,
  });
  const shareRes = await shareWorkspaceByEmail(workspaceId, workspaceName, collaborator.email);
  expect(shareRes.ok).toBe(true);
  await runWorkspaceSync(workspaceId);
  stashDevice(owner);

  await activateDevice(collaborator);
  const incoming = await listWorkspaceShares();
  expect(incoming.error).toBeUndefined();
  const pending = (incoming.data || []).find(
    (row) => row.workspace_id === workspaceId && row.status === 'pending',
  );
  expect(pending?.id).toBeTruthy();
  stashDevice(collaborator);

  return {
    workspaceId,
    workspaceName,
    noteId,
    shareId: String(pending?.id || ''),
  };
}

paidDescribe('shared workspace collaboration flows (paid)', () => {
  const ownerUserId = process.env.VITEST_SUPABASE_USER_ID?.trim() || '';
  const ownerSessionToken = process.env.VITEST_SUPABASE_SESSION_TOKEN?.trim() || '';
  const ownerEmail = `vitest-${ownerUserId.replace(/-/g, '')}@plainsight.test`;

  let owner: DeviceContext;
  let collaborator: DeviceContext | null = null;
  const workspaceIdsToCleanup: string[] = [];

  beforeEach(async () => {
    vi.restoreAllMocks();
    clearPlainsightStorage();
    localStorage.clear();
    sessionStorage.clear();
    await ensurePaidTestIdentity();
    owner = {
      userId: ownerUserId,
      sessionToken: ownerSessionToken,
      email: ownerEmail,
      snapshot: { local: {}, session: {} },
    };
    collaborator = await createCollaboratorIdentity();
  });

  afterEach(async () => {
    resetSyncQueueForTests();
    for (const wid of workspaceIdsToCleanup.splice(0)) {
      await deleteRemoteWorkspaceCascadeViaService(wid);
    }
    await cleanupCollaboratorIdentity(collaborator);
    collaborator = null;
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('accepts invite, syncs collaborator edits, and resolves merge conflicts via latest update', async () => {
    const c = collaborator!;
    const setup = await setupAcceptedSharedWorkspace(owner, c);
    workspaceIdsToCleanup.push(setup.workspaceId);

    await activateDevice(c);
    await runWorkspaceSync(setup.workspaceId);
    expect(readWorkspaceNoteText(setup.workspaceId, setup.noteId)).toBe('baseline shared note');
    stashDevice(c);
    const collaboratorStaleSnapshot = structuredClone(c.snapshot);

    await activateDevice(owner);
    upsertWorkspaceNote(
      setup.workspaceId,
      setup.noteId,
      'owner realtime edit',
      '2030-01-01T00:00:01.000Z',
    );
    await runWorkspaceSync(setup.workspaceId);
    stashDevice(owner);

    await activateDevice(c);
    await runWorkspaceSync(setup.workspaceId);
    expect(readWorkspaceNoteText(setup.workspaceId, setup.noteId)).toBe('owner realtime edit');
    stashDevice(c);

    await activateDevice(owner);
    upsertWorkspaceNote(
      setup.workspaceId,
      setup.noteId,
      'owner conflict edit',
      '2030-01-01T00:00:02.000Z',
    );
    await runWorkspaceSync(setup.workspaceId);
    stashDevice(owner);

    c.snapshot = collaboratorStaleSnapshot;
    await activateDevice(c);
    upsertWorkspaceNote(
      setup.workspaceId,
      setup.noteId,
      'collaborator conflict winner',
      '2030-01-01T00:00:03.000Z',
    );
    await runWorkspaceSync(setup.workspaceId);
    stashDevice(c);

    expect(await readRemoteNoteText(setup.noteId)).toBe('collaborator conflict winner');

    await activateDevice(owner);
    await runWorkspaceSync(setup.workspaceId);
    expect(readWorkspaceNoteText(setup.workspaceId, setup.noteId)).toBe(
      'collaborator conflict winner',
    );
  });

  it('prevents collaborator from deleting owner workspace data', async () => {
    const c = collaborator!;
    const setup = await setupAcceptedSharedWorkspace(owner, c);
    workspaceIdsToCleanup.push(setup.workspaceId);

    await activateDevice(c);
    const deleteRes = await deleteWorkspaceRemote(setup.workspaceId);
    expect(deleteRes.ok).toBe(false);

    expect(await remoteWorkspaceExists(setup.workspaceId)).toBe(true);
    expect(await countNotesInWorkspace(setup.workspaceId)).toBe(1);
  });

  it('keeps pending shares inaccessible until collaborator accepts invite', async () => {
    const c = collaborator!;
    const pending = await setupPendingSharedWorkspace(owner, c);
    workspaceIdsToCleanup.push(pending.workspaceId);

    await activateDevice(c);
    await runWorkspaceSync(pending.workspaceId);
    const localRows = await getLocalWorkspaces();
    expect(localRows.some((w) => w.id === pending.workspaceId)).toBe(false);
    expect(await getLocalNotes(pending.workspaceId)).toEqual([]);

    const acceptRes = await acceptWorkspaceShare(pending.shareId);
    expect(acceptRes.ok).toBe(true);
    await runWorkspaceSync(pending.workspaceId);
    expect(readWorkspaceNoteText(pending.workspaceId, pending.noteId)).toBe(
      'pending invite baseline',
    );
  });

  it('prevents collaborator from making shared workspace private', async () => {
    const c = collaborator!;
    const setup = await setupAcceptedSharedWorkspace(owner, c);
    workspaceIdsToCleanup.push(setup.workspaceId);

    await activateDevice(c);
    const res = await makeWorkspacePrivate(setup.workspaceId);
    expect(res.ok).toBe(false);

    await activateDevice(owner);
    await runWorkspaceSync(setup.workspaceId);
    expect(readWorkspaceNoteText(setup.workspaceId, setup.noteId)).toBe('baseline shared note');
  });

  it('revoking shared workspace removes collaborator access and local data on sync', async () => {
    const c = collaborator!;
    const setup = await setupAcceptedSharedWorkspace(owner, c);
    workspaceIdsToCleanup.push(setup.workspaceId);

    await activateDevice(owner);
    const privateRes = await makeWorkspacePrivate(setup.workspaceId);
    expect(privateRes.ok).toBe(true);
    expect(privateRes.revokedCount).toBeGreaterThanOrEqual(1);
    stashDevice(owner);

    await activateDevice(c);
    await runWorkspaceSync(setup.workspaceId);
    const localRows = await getLocalWorkspaces();
    expect(localRows.some((w) => w.id === setup.workspaceId)).toBe(false);
    expect(await getLocalNotes(setup.workspaceId)).toEqual([]);

    const activityAttempt = await logWorkspaceActivity(
      setup.workspaceId,
      'note_updated',
      'should be blocked after revoke',
      { source: 'test' },
    );
    expect(activityAttempt.ok).toBe(false);
  });

  it('owner deleting workspace removes share visibility and collaborator local workspace', async () => {
    const c = collaborator!;
    const setup = await setupAcceptedSharedWorkspace(owner, c);

    await activateDevice(owner);
    const deleteRes = await deleteWorkspaceRemote(setup.workspaceId);
    expect(deleteRes.ok).toBe(true);
    stashDevice(owner);

    await activateDevice(c);
    await runWorkspaceSync(setup.workspaceId);
    const localRows = await getLocalWorkspaces();
    expect(localRows.some((w) => w.id === setup.workspaceId)).toBe(false);
    expect(await getLocalNotes(setup.workspaceId)).toEqual([]);
    const shares = await listWorkspaceShares();
    expect((shares.data || []).some((row) => row.workspace_id === setup.workspaceId)).toBe(
      false,
    );
  });

  it('rejects accepting invite after owner deletes the shared workspace', async () => {
    const c = collaborator!;
    const pending = await setupPendingSharedWorkspace(owner, c);

    await activateDevice(owner);
    const deleteRes = await deleteWorkspaceRemote(pending.workspaceId);
    expect(deleteRes.ok).toBe(true);
    stashDevice(owner);

    await activateDevice(c);
    const acceptRes = await acceptWorkspaceShare(pending.shareId);
    expect(acceptRes.ok).toBe(false);
    await runWorkspaceSync(pending.workspaceId);
    const localRows = await getLocalWorkspaces();
    expect(localRows.some((w) => w.id === pending.workspaceId)).toBe(false);
  });

  /**
   * Simulates user1 syncing to the server, then user2 receiving the row without manually running sync.
   * Outcome is deterministic: if Realtime + debounced queueFullSync does not hydrate in time, we assert after explicit fullSync.
   */
  it('cross-user: new server note reaches collaborator (realtime window, else fullSync fallback)', async () => {
    const c = collaborator!;
    const setup = await setupAcceptedSharedWorkspace(owner, c);
    workspaceIdsToCleanup.push(setup.workspaceId);

    const noteId2 = crypto.randomUUID();
    const now = new Date().toISOString();
    const noteText = 'owner-line note for user2';

    await activateDevice(c);
    await whenRealtimeAuthReady();
    const { subscribeToNotes } = await import('../src/sync/syncEngine');
    const { queueFullSync } = await import('../src/sync/syncHelpers');
    const unsubs: (() => void)[] = [];
    unsubs.push(subscribeToNotes(setup.workspaceId, () => queueFullSync()));

    const t0 = performance.now();
    await insertNoteRowViaService({
      id: noteId2,
      workspace_id: setup.workspaceId,
      text: noteText,
      category_id: null,
      created_at: now,
      updated_at: now,
    });

    let sawViaRealtimePath = false;
    try {
      await waitFor(
        () => {
          expect(readWorkspaceNoteText(setup.workspaceId, noteId2)).toBe(noteText);
        },
        { timeout: 6_000, interval: 250 },
      );
      sawViaRealtimePath = true;
    } catch {
      await runWorkspaceSync(setup.workspaceId);
      expect(readWorkspaceNoteText(setup.workspaceId, noteId2)).toBe(noteText);
    }
    const elapsedMs = Math.round(performance.now() - t0);
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
    expect(readWorkspaceNoteText(setup.workspaceId, noteId2)).toBe(noteText);
    if (sawViaRealtimePath) {
      expect(elapsedMs).toBeLessThan(25_000);
    }
    // eslint-disable-next-line no-console -- surfaced in CI logs for propagation latency
    console.info(
      `[vitest] shared-workspace note2 propagation: ${sawViaRealtimePath ? 'realtime+debouncedSync' : 'fullSyncFallback'} ${elapsedMs}ms`,
    );

    unsubs.forEach((u) => u());
    resetSyncQueueForTests();
    stashDevice(c);

    await activateDevice(owner);
    await runWorkspaceSync(setup.workspaceId);
    expect(readWorkspaceNoteText(setup.workspaceId, noteId2)).toBe(noteText);
  });

  it('realtime: collaborator activity log reaches owner subscription', async () => {
    const c = collaborator!;
    const setup = await setupAcceptedSharedWorkspace(owner, c);
    workspaceIdsToCleanup.push(setup.workspaceId);

    await activateDevice(owner);
    await whenRealtimeAuthReady();

    let saw = false;
    const unsub = subscribeToWorkspaceActivityLogs(setup.workspaceId, (p) => {
      if (p?.event !== 'INSERT') return;
      const row = p?.newRow;
      if (!row?.id) return;
      if (String(row.workspace_id) !== String(setup.workspaceId)) return;
      if (String(row.actor_user_id) !== String(c.userId)) return;
      if (String(row.action) !== 'note_added') return;
      saw = true;
    });

    stashDevice(owner);

    await activateDevice(c);
    const res = await logWorkspaceActivity(setup.workspaceId, 'note_added', 'Added note', {
      note_id: crypto.randomUUID(),
      source: 'vitest',
    });
    expect(res.ok).toBe(true);

    // Restore owner device snapshot and wait for the realtime event.
    await activateDevice(owner);
    try {
      await waitFor(() => expect(saw).toBe(true), { timeout: 8_000, interval: 200 });
    } finally {
      unsub();
    }
  });

  it('cross-user: collaborator deletes added note; remote and both blobs stay one-note after many fullSync rounds', async () => {
    const c = collaborator!;
    const setup = await setupAcceptedSharedWorkspace(owner, c);
    workspaceIdsToCleanup.push(setup.workspaceId);

    const noteId2 = crypto.randomUUID();
    const now = new Date().toISOString();

    await activateDevice(owner);
    upsertWorkspaceNote(setup.workspaceId, noteId2, 'second note to delete', now);
    await runWorkspaceSync(setup.workspaceId);
    stashDevice(owner);

    await activateDevice(c);
    await runWorkspaceSync(setup.workspaceId);
    expect(listWorkspaceNoteIds(setup.workspaceId).sort()).toEqual(
      [setup.noteId, noteId2].sort(),
    );

    await deleteWorkspaceNoteAsLocalUser(c, setup.workspaceId, noteId2);

    expect(await countNotesInWorkspace(setup.workspaceId)).toBe(1);
    expect(readWorkspaceNoteText(setup.workspaceId, noteId2)).toBe(null);
    expect(readWorkspaceNoteText(setup.workspaceId, setup.noteId)).toBe('baseline shared note');

    // Owner blob is still stale (still lists the deleted id) until fullSync merges with remote.
    await activateDevice(owner);
    await runWorkspaceSync(setup.workspaceId);
    expect(await countNotesInWorkspace(setup.workspaceId)).toBe(1);
    expect(readWorkspaceNoteText(setup.workspaceId, noteId2)).toBe(null);
    stashDevice(owner);

    await activateDevice(c);
    await runWorkspaceSync(setup.workspaceId);
    expect(readWorkspaceNoteText(setup.workspaceId, noteId2)).toBe(null);

    for (let round = 0; round < 4; round += 1) {
      await activateDevice(owner);
      await runWorkspaceSync(setup.workspaceId);
      expect(await countNotesInWorkspace(setup.workspaceId)).toBe(1);
      expect(readWorkspaceNoteText(setup.workspaceId, noteId2)).toBe(null);
      expect(readWorkspaceNoteText(setup.workspaceId, setup.noteId)).toBe('baseline shared note');

      await activateDevice(c);
      await runWorkspaceSync(setup.workspaceId);
      expect(await countNotesInWorkspace(setup.workspaceId)).toBe(1);
      expect(readWorkspaceNoteText(setup.workspaceId, noteId2)).toBe(null);
      expect(readWorkspaceNoteText(setup.workspaceId, setup.noteId)).toBe('baseline shared note');
    }
  });

  it.skipIf(process.env.VITEST_SLOW_VISIBILITY_POLL !== '1')(
    'optional slow guard: deleted note does not reappear after ~8s visibility poll window (set VITEST_SLOW_VISIBILITY_POLL=1)',
    async () => {
      const c = collaborator!;
      const setup = await setupAcceptedSharedWorkspace(owner, c);
      workspaceIdsToCleanup.push(setup.workspaceId);

      const noteId2 = crypto.randomUUID();
      const now = new Date().toISOString();

      await activateDevice(owner);
      upsertWorkspaceNote(setup.workspaceId, noteId2, 'ephemeral', now);
      await runWorkspaceSync(setup.workspaceId);
      stashDevice(owner);

      await activateDevice(c);
      await runWorkspaceSync(setup.workspaceId);
      await deleteWorkspaceNoteAsLocalUser(c, setup.workspaceId, noteId2);
      expect(await countNotesInWorkspace(setup.workspaceId)).toBe(1);

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 8_500);
      });

      await activateDevice(owner);
      await runWorkspaceSync(setup.workspaceId);
      expect(readWorkspaceNoteText(setup.workspaceId, noteId2)).toBe(null);

      await activateDevice(c);
      await runWorkspaceSync(setup.workspaceId);
      expect(readWorkspaceNoteText(setup.workspaceId, noteId2)).toBe(null);
    },
    30_000,
  );
});
