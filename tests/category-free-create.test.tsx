/**
 * A. Free user — create category: UI + local store update; Supabase categories table unchanged.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { categoryChipTestIdSlug } from '../src/components/CategoryChips';
import * as syncEngine from '../src/sync/syncEngine';
import { getOrCreateWorkspaceIdForStorageKey } from '../src/utils/storage';
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

describe('free user — create category', () => {
  beforeEach(async () => {
    clearPlainsightStorage();
    if (hasServiceRole) await clearSupabaseTables();
    configureFreeUserTestMode();
    seedFreshHomeWorkspace();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates UI and local workspace; does not sync categories to Supabase', async () => {
    const fullSyncSpy = vi.spyOn(syncEngine, 'fullSync');

    const user = userEvent.setup();
    renderHomePage();
    await waitForCategoryRowReady();

    const wid = getOrCreateWorkspaceIdForStorageKey('workspace_home');
    let remoteCountBefore = 0;
    if (hasServiceRole) {
      remoteCountBefore = (await getCategories(wid)).length;
    }

    await user.click(screen.getByTestId('category-chip--add'));
    await user.type(screen.getByTestId('category-inline-name-input'), 'FreeCreateCat');
    await user.click(screen.getByTestId('category-inline-submit'));

    await waitFor(() => {
      expect(screen.getByTestId(`category-chip--${categoryChipTestIdSlug('FreeCreateCat')}`)).toBeInTheDocument();
    });

    expect(readHomeCategories()).toContain('FreeCreateCat');
    expect(fullSyncSpy).not.toHaveBeenCalled();

    if (hasServiceRole) {
      const remoteAfter = await getCategories(wid);
      expect(remoteAfter.length).toBe(remoteCountBefore);
      expect(remoteAfter.some((r) => r.name === 'FreeCreateCat')).toBe(false);
    }
  });
});
