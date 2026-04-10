/**
 * C. Paid user — create category: UI + local store + Supabase row after explicit push.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { categoryChipTestIdSlug } from '../src/components/CategoryChips';
import { getOrCreateWorkspaceIdForStorageKey } from '../src/utils/storage';
import {
  clearPlainsightStorage,
  configurePaidUserTestMode,
  preparePaidUserRemoteFixtures,
  pushHomeWorkspaceToSupabase,
  readHomeCategories,
  renderHomePage,
  seedFreshHomeWorkspace,
  waitForCategoryRowReady,
} from './categoryTestHarness';
import { clearSupabaseTables, getCategories } from './supabaseTestHelpers';

const paidEnvOk =
  Boolean(process.env.VITEST_SUPABASE_USER_ID?.trim()) &&
  Boolean(process.env.VITEST_SUPABASE_SESSION_TOKEN?.trim()) &&
  Boolean(process.env.VITEST_SUPABASE_SERVICE_ROLE_KEY?.trim()) &&
  Boolean(process.env.VITE_SUPABASE_URL?.trim()) &&
  Boolean(process.env.VITE_SUPABASE_ANON_KEY?.trim());

const describePaid = paidEnvOk ? describe : describe.skip;

describePaid('paid user — create category', () => {
  beforeEach(async () => {
    clearPlainsightStorage();
    await clearSupabaseTables();
    configurePaidUserTestMode();
    seedFreshHomeWorkspace();
    await preparePaidUserRemoteFixtures();
  });

  it('updates UI, local workspace, and inserts a categories row after sync', async () => {
    const user = userEvent.setup();
    renderHomePage();
    await waitForCategoryRowReady({ expectPaidSync: true });

    const wid = getOrCreateWorkspaceIdForStorageKey('workspace_home');

    await user.click(screen.getByTestId('category-chip--add'));
    await user.type(screen.getByTestId('category-inline-name-input'), 'PaidCreateCat');
    await user.click(screen.getByTestId('category-inline-submit'));

    await waitFor(() => {
      expect(screen.getByTestId(`category-chip--${categoryChipTestIdSlug('PaidCreateCat')}`)).toBeInTheDocument();
    });
    expect(readHomeCategories()).toContain('PaidCreateCat');

    await pushHomeWorkspaceToSupabase();

    await waitFor(async () => {
      const rows = await getCategories(wid);
      expect(rows.some((r) => r.name === 'PaidCreateCat')).toBe(true);
    });
  });
});
