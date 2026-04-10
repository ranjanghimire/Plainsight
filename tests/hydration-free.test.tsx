/**
 * Free user: local-only bootstrap — no Supabase / fullSync / post-hydration queueFullSync.
 */

import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as syncEngine from '../src/sync/syncEngine';
import * as syncHelpers from '../src/sync/syncHelpers';
import { setWorkspaceIdMapping } from '../src/utils/storage';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  seedFreshHomeWorkspace,
} from './categoryTestHarness';
import { createHydrationTestWorkspaceId, renderHydrationHome, waitForHydrationCompleteAttr } from './hydration/hydrationHarness';
import { seedHomePlusVisibleWorkspaceWithRowId } from './hydration/hydrationWorkspaceSeed';

const FREE_HOME_ROW_ID = createHydrationTestWorkspaceId();
const FREE_SECOND_VISIBLE_ROW_ID = createHydrationTestWorkspaceId();

describe('hydration — free user (local only)', () => {
  beforeEach(() => {
    clearPlainsightStorage();
    configureFreeUserTestMode();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not run fullSync, does not queue follow-up sync; shows local workspaces and active Home', async () => {
    const fullSpy = vi.spyOn(syncEngine, 'fullSync');
    const queueSpy = vi.spyOn(syncHelpers, 'queueFullSync');
    seedHomePlusVisibleWorkspaceWithRowId('HydrationVis', FREE_SECOND_VISIBLE_ROW_ID);

    renderHydrationHome();

    await waitForHydrationCompleteAttr();

    expect(fullSpy).not.toHaveBeenCalled();
    expect(queueSpy).not.toHaveBeenCalled();

    const probe = screen.getByTestId('hydration-probe');
    expect(probe.getAttribute('data-active-key')).toBe('workspace_home');
    expect(probe.getAttribute('data-visible-count')).toBe('2');
    expect(probe.getAttribute('data-visible-names')).toContain('Home');
    expect(probe.getAttribute('data-visible-names')).toContain('HydrationVis');
  });

  it('single-tab home still skips cloud sync path', async () => {
    const fullSpy = vi.spyOn(syncEngine, 'fullSync');
    seedFreshHomeWorkspace();
    setWorkspaceIdMapping('workspace_home', FREE_HOME_ROW_ID);
    renderHydrationHome();
    await waitForHydrationCompleteAttr();
    expect(fullSpy).not.toHaveBeenCalled();
  });
});
