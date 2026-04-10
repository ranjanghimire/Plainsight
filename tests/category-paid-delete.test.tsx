/**
 * D. Paid user — delete category: pre-seeded remote row; after delete + sync, row removed.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { categoryChipTestIdSlug } from '../src/components/CategoryChips';
import {
  getDefaultWorkspaceData,
  getOrCreateWorkspaceIdForStorageKey,
  getWorkspaceIdForStorageKey,
  saveWorkspace,
} from '../src/utils/storage';
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
import { clearSupabaseTables, getCategories, getCategoryById } from './supabaseTestHelpers';

const paidEnvOk =
  Boolean(process.env.VITEST_SUPABASE_USER_ID?.trim()) &&
  Boolean(process.env.VITEST_SUPABASE_SESSION_TOKEN?.trim()) &&
  Boolean(process.env.VITEST_SUPABASE_SERVICE_ROLE_KEY?.trim()) &&
  Boolean(process.env.VITE_SUPABASE_URL?.trim()) &&
  Boolean(process.env.VITE_SUPABASE_ANON_KEY?.trim());

const describePaid = paidEnvOk ? describe : describe.skip;
const SEED = 'PaidDelRemote';

function homeWorkspaceUuid(): string {
  return (
    getWorkspaceIdForStorageKey('workspace_home') ??
    getOrCreateWorkspaceIdForStorageKey('workspace_home')
  );
}

describePaid('paid user — delete category', () => {
  beforeEach(async () => {
    clearPlainsightStorage();
    await clearSupabaseTables();
    configurePaidUserTestMode();
    seedFreshHomeWorkspace();
    await preparePaidUserRemoteFixtures();
  });

  it('removes UI, local category, and Supabase row after sync', async () => {
    renderHomePage();
    await waitForCategoryRowReady({ expectPaidSync: true });

    const base = getDefaultWorkspaceData();
    saveWorkspace('workspace_home', { ...base, categories: [SEED] });
    window.dispatchEvent(new CustomEvent('plainsight:workspace-storage-mutated'));
    await screen.findByTestId(`category-chip--${categoryChipTestIdSlug(SEED)}`);

    await pushHomeWorkspaceToSupabase();

    let rowId = '';
    await waitFor(async () => {
      const wid = homeWorkspaceUuid();
      const rows = await getCategories(wid);
      const row = rows.find((r) => r.name === SEED);
      expect(row).toBeTruthy();
      rowId = row!.id;
    });
    expect(await getCategoryById(rowId)).not.toBeNull();

    const user = userEvent.setup();
    const chip = await screen.findByTestId(`category-chip--${categoryChipTestIdSlug(SEED)}`);
    fireEvent.contextMenu(chip);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await user.click(screen.getByTestId('mock-confirm-ok'));

    await waitFor(() => {
      expect(screen.queryByText(SEED, { selector: 'button' })).not.toBeInTheDocument();
    });
    expect(readHomeCategories()).not.toContain(SEED);

    await pushHomeWorkspaceToSupabase();

    await waitFor(async () => {
      expect(await getCategoryById(rowId)).toBeNull();
      const rows = await getCategories(homeWorkspaceUuid());
      expect(rows.some((r) => r.name === SEED)).toBe(false);
    });
  });
});
