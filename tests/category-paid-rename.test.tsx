/**
 * Paid user — rename category: after sync, the existing remote row should be renamed (same id),
 * not duplicated as a new row.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { categoryChipTestIdSlug } from '../src/components/CategoryChips';
import { getOrCreateWorkspaceIdForStorageKey } from '../src/utils/storage';
import {
  clearPlainsightStorage,
  configurePaidUserTestMode,
  preparePaidUserRemoteFixtures,
  pushHomeWorkspaceToSupabase,
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

describePaid('paid user — rename category', () => {
  beforeEach(async () => {
    clearPlainsightStorage();
    await clearSupabaseTables();
    configurePaidUserTestMode();
    seedFreshHomeWorkspace();
    await preparePaidUserRemoteFixtures();
  });

  it('renames existing remote row (same id), does not create a second category row', async () => {
    const user = userEvent.setup();
    renderHomePage();
    await waitForCategoryRowReady({ expectPaidSync: true });

    const wid = getOrCreateWorkspaceIdForStorageKey('workspace_home');

    await user.click(screen.getByTestId('category-chip--add'));
    await user.type(screen.getByTestId('category-inline-name-input'), 'PaidRenameOld');
    await user.click(screen.getByTestId('category-inline-submit'));
    await screen.findByTestId(`category-chip--${categoryChipTestIdSlug('PaidRenameOld')}`);

    await pushHomeWorkspaceToSupabase();

    let originalId = '';
    await waitFor(async () => {
      const rows = await getCategories(wid);
      const row = rows.find((r) => r.name === 'PaidRenameOld');
      expect(row).toBeTruthy();
      originalId = row!.id;
    });

    const chip = screen.getByTestId(`category-chip--${categoryChipTestIdSlug('PaidRenameOld')}`);
    fireEvent.contextMenu(chip, { bubbles: true });
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const input = await screen.findByDisplayValue('PaidRenameOld');
    await user.clear(input);
    await user.type(input, 'PaidRenameNew{enter}');

    await screen.findByTestId(`category-chip--${categoryChipTestIdSlug('PaidRenameNew')}`);

    await pushHomeWorkspaceToSupabase();

    await waitFor(async () => {
      const rows = await getCategories(wid);
      expect(rows.some((r) => r.id === originalId && r.name === 'PaidRenameNew')).toBe(true);
      expect(rows.some((r) => r.name === 'PaidRenameOld')).toBe(false);
      expect(rows.filter((r) => r.name === 'PaidRenameNew').length).toBe(1);
    });
  });
});

