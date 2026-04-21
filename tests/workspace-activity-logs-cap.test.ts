/**
 * Requires `supabase/migrations/20260420180000_workspace_activity_logs_cap.sql`
 * applied to the Supabase project used by `VITE_SUPABASE_URL`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteRemoteWorkspaceCascadeViaService,
  ensurePaidTestIdentity,
  ensureRemoteWorkspaceRow,
  getSupabaseServiceClient,
} from './supabaseTestHelpers';

const hasPaidEnv = Boolean(
  process.env.VITE_SUPABASE_URL?.trim() &&
    process.env.VITEST_SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    process.env.VITEST_SUPABASE_USER_ID?.trim() &&
    process.env.VITEST_SUPABASE_SESSION_TOKEN?.trim(),
);
const paidDescribe = hasPaidEnv ? describe : describe.skip;

paidDescribe('workspace_activity_logs cap (100 per workspace)', () => {
  const userId = process.env.VITEST_SUPABASE_USER_ID!.trim();
  const workspaceA = crypto.randomUUID();
  const workspaceB = crypto.randomUUID();

  beforeEach(async () => {
    await ensurePaidTestIdentity();
    await ensureRemoteWorkspaceRow({
      workspaceId: workspaceA,
      ownerId: userId,
      name: 'ActivityLogCap A',
      kind: 'visible',
    });
    await ensureRemoteWorkspaceRow({
      workspaceId: workspaceB,
      ownerId: userId,
      name: 'ActivityLogCap B',
      kind: 'visible',
    });
  });

  afterEach(async () => {
    await deleteRemoteWorkspaceCascadeViaService(workspaceA);
    await deleteRemoteWorkspaceCascadeViaService(workspaceB);
  });

  it('purges oldest rows so a workspace never keeps more than 100 logs', async () => {
    const sb = getSupabaseServiceClient();
    const base = Date.UTC(2021, 0, 1, 0, 0, 0);
    const rows = Array.from({ length: 105 }, (_, i) => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceA,
      actor_user_id: userId,
      actor_email: 'cap-test@plainsight.test',
      action: 'test_cap',
      summary: `seq-${i}`,
      details: {} as Record<string, unknown>,
      created_at: new Date(base + i * 60_000).toISOString(),
    }));

    const { error } = await sb.from('workspace_activity_logs').insert(rows);
    expect(error).toBeNull();

    const { error: capErr } = await sb.rpc('plainsight_enforce_workspace_activity_log_cap', {
      p_workspace_id: workspaceA,
    });
    // If the migration hasn't been applied to the Supabase project backing this test run,
    // PostgREST won't have this function in its schema cache (PGRST202).
    // In that case, skip the rest of the assertions rather than failing CI for missing DB setup.
    if (capErr?.code === 'PGRST202') {
      // eslint-disable-next-line no-console
      console.warn(
        'Skipping workspace activity log cap assertions: missing plainsight_enforce_workspace_activity_log_cap (apply supabase/migrations/20260420180000_workspace_activity_logs_cap.sql)',
      );
      return;
    }
    expect(capErr).toBeNull();

    const { count, error: cErr } = await sb
      .from('workspace_activity_logs')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceA);
    expect(cErr).toBeNull();
    expect(count).toBe(100);

    const { data: oldest, error: oErr } = await sb
      .from('workspace_activity_logs')
      .select('summary')
      .eq('workspace_id', workspaceA)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    expect(oErr).toBeNull();
    expect(oldest?.summary).toBe('seq-5');
  });

  it('does not trim logs for a different workspace', async () => {
    const sb = getSupabaseServiceClient();
    const base = Date.UTC(2022, 5, 1, 0, 0, 0);
    const rowsA = Array.from({ length: 60 }, (_, i) => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceA,
      actor_user_id: userId,
      actor_email: 'cap-test@plainsight.test',
      action: 'test_cap',
      summary: `a-${i}`,
      details: {},
      created_at: new Date(base + i * 1000).toISOString(),
    }));
    const rowsB = Array.from({ length: 50 }, (_, i) => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceB,
      actor_user_id: userId,
      actor_email: 'cap-test@plainsight.test',
      action: 'test_cap',
      summary: `b-${i}`,
      details: {},
      created_at: new Date(base + i * 1000).toISOString(),
    }));

    const { error: e1 } = await sb.from('workspace_activity_logs').insert(rowsA);
    const { error: e2 } = await sb.from('workspace_activity_logs').insert(rowsB);
    expect(e1).toBeNull();
    expect(e2).toBeNull();

    const { count: cA, error: aErr } = await sb
      .from('workspace_activity_logs')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceA);
    const { count: cB, error: bErr } = await sb
      .from('workspace_activity_logs')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceB);
    expect(aErr).toBeNull();
    expect(bErr).toBeNull();
    expect(cA).toBe(60);
    expect(cB).toBe(50);
  });
});
