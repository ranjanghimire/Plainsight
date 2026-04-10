/**
 * B. Free user — delete category: UI + local store; Supabase unchanged.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { categoryChipTestIdSlug } from '../src/components/CategoryChips';
import * as syncEngine from '../src/sync/syncEngine';
import {
  getDefaultWorkspaceData,
  getOrCreateWorkspaceIdForStorageKey,
  saveWorkspace,
} from '../src/utils/storage';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  readHomeCategories,
  renderHomePage,
  seedFreshHomeWorkspace,
  waitForCategoryRowReady,
} from './categoryTestHarness';
import { clearSupabaseTables, getCategories } from './supabaseTestHelpers';

const hasServiceRole = Boolean(process.env.VITEST_SUPABASE_SERVICE_ROLE_KEY?.trim());
const SEED = 'FreeDelSeed';

describe('free user — delete category', () => {
  beforeEach(async () => {
    clearPlainsightStorage();
    if (hasServiceRole) await clearSupabaseTables();
    configureFreeUserTestMode();
    seedFreshHomeWorkspace();
    const base = getDefaultWorkspaceData();
    saveWorkspace('workspace_home', { ...base, categories: [SEED] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes chip and local category; does not call fullSync or change remote categories', async () => {
    const fullSyncSpy = vi.spyOn(syncEngine, 'fullSync');
    const user = userEvent.setup();

    renderHomePage();
    await waitForCategoryRowReady();

    const wid = getOrCreateWorkspaceIdForStorageKey('workspace_home');
    let remoteCountBefore = 0;
    if (hasServiceRole) {
      remoteCountBefore = (await getCategories(wid)).length;
    }

    const chip = await screen.findByTestId(`category-chip--${categoryChipTestIdSlug(SEED)}`);
    fireEvent.contextMenu(chip);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await user.click(screen.getByTestId('mock-confirm-ok'));

    await waitFor(() => {
      expect(screen.queryByText(SEED, { selector: 'button' })).not.toBeInTheDocument();
    });

    expect(readHomeCategories()).not.toContain(SEED);
    expect(fullSyncSpy).not.toHaveBeenCalled();

    if (hasServiceRole) {
      const remoteAfter = await getCategories(wid);
      expect(remoteAfter.length).toBe(remoteCountBefore);
    }
  });
});
