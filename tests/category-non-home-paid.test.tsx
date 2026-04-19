/**
 * Paid user: category create/delete + Supabase on menu-visible and hidden workspaces.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { categoryChipTestIdSlug } from '../src/components/CategoryChips';
import { getDefaultWorkspaceData, saveWorkspace } from '../src/utils/storage';
import {
  clearPlainsightStorage,
  configurePaidUserTestMode,
  preparePaidRemoteWorkspaceRowsForKeys,
  pushWorkspaceToSupabase,
  readWorkspaceCategories,
  renderHomePage,
  seedHomePlusHiddenWorkspace,
  seedHomePlusVisibleWorkspace,
  settlePaidSyncAfterWorkspaceSwitch,
  switchToHiddenWorkspaceName,
  switchToVisibleWorkspaceEntry,
  waitForCategoryRowReady,
  workspaceUuidForStorageKey,
} from './categoryTestHarness';
import { clearSupabaseTables, getCategories, getCategoryById } from './supabaseTestHelpers';

const paidEnvOk =
  Boolean(process.env.VITEST_SUPABASE_USER_ID?.trim()) &&
  Boolean(process.env.VITEST_SUPABASE_SESSION_TOKEN?.trim()) &&
  Boolean(process.env.VITEST_SUPABASE_SERVICE_ROLE_KEY?.trim()) &&
  Boolean(process.env.VITE_SUPABASE_URL?.trim()) &&
  Boolean(process.env.VITE_SUPABASE_ANON_KEY?.trim());

const describePaid = paidEnvOk ? describe : describe.skip;

describePaid('paid user — visible (non-home) workspace categories + Supabase', () => {
  beforeEach(async () => {
    clearPlainsightStorage();
    await clearSupabaseTables();
    configurePaidUserTestMode();
  });

  it('creates category, push inserts remote row for that workspace id', async () => {
    const { entry, visKey } = seedHomePlusVisibleWorkspace('PaidVisTab');
    await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home', visKey]);

    const user = userEvent.setup();
    renderHomePage();
    await waitForCategoryRowReady({ expectPaidSync: true });

    await switchToVisibleWorkspaceEntry(entry);
    await settlePaidSyncAfterWorkspaceSwitch();

    await user.click(screen.getByTestId('category-chip--add'));
    await user.type(screen.getByTestId('category-inline-name-input'), 'PaidVisCreate');
    await user.click(screen.getByTestId('category-inline-submit'));

    await waitFor(() => {
      expect(
        screen.getByTestId(`category-chip--${categoryChipTestIdSlug('PaidVisCreate')}`),
      ).toBeInTheDocument();
    });
    expect(readWorkspaceCategories(visKey)).toContain('PaidVisCreate');

    await pushWorkspaceToSupabase(visKey);

    const wid = workspaceUuidForStorageKey(visKey);
    await waitFor(async () => {
      const rows = await getCategories(wid);
      expect(rows.some((r) => r.name === 'PaidVisCreate')).toBe(true);
    });
  });

  it('deletes category; second push removes remote row', async () => {
    const { entry, visKey } = seedHomePlusVisibleWorkspace('PaidVisDelTab');
    await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home', visKey]);

    renderHomePage();
    await waitForCategoryRowReady({ expectPaidSync: true });

    const base = getDefaultWorkspaceData();
    saveWorkspace(entry.key, { ...base, categories: ['PaidVisDel'] });
    window.dispatchEvent(new CustomEvent('plainsight:workspace-storage-mutated'));

    await switchToVisibleWorkspaceEntry(entry);
    await screen.findByTestId(`category-chip--${categoryChipTestIdSlug('PaidVisDel')}`);
    await settlePaidSyncAfterWorkspaceSwitch();

    await pushWorkspaceToSupabase(visKey);

    const wid = workspaceUuidForStorageKey(visKey);
    let rowId = '';
    await waitFor(async () => {
      const rows = await getCategories(wid);
      const row = rows.find((r) => r.name === 'PaidVisDel');
      expect(row).toBeTruthy();
      rowId = row!.id;
    });

    const user = userEvent.setup();
    const chip = await screen.findByTestId(`category-chip--${categoryChipTestIdSlug('PaidVisDel')}`);
    fireEvent.contextMenu(chip);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await user.click(screen.getByTestId('mock-confirm-ok'));

    await waitFor(() => {
      expect(screen.queryByText('PaidVisDel', { selector: 'button' })).not.toBeInTheDocument();
    });
    expect(readWorkspaceCategories(visKey)).not.toContain('PaidVisDel');

    await settlePaidSyncAfterWorkspaceSwitch();
    await pushWorkspaceToSupabase(visKey);

    await waitFor(async () => {
      expect(await getCategoryById(rowId)).toBeNull();
      const rows = await getCategories(wid);
      expect(rows.some((r) => r.name === 'PaidVisDel')).toBe(false);
    });
  });
});

describePaid('paid user — hidden workspace categories + Supabase', () => {
  beforeEach(async () => {
    clearPlainsightStorage();
    await clearSupabaseTables();
    configurePaidUserTestMode();
  });

  it('creates category, push inserts remote row for hidden workspace id', async () => {
    const { hiddenKey, switchName } = seedHomePlusHiddenWorkspace('paidhidcr');
    await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home', hiddenKey]);

    const user = userEvent.setup();
    renderHomePage();
    await waitForCategoryRowReady({ expectPaidSync: true });

    await switchToHiddenWorkspaceName(switchName);
    await settlePaidSyncAfterWorkspaceSwitch();

    await user.click(screen.getByTestId('category-chip--add'));
    await user.type(screen.getByTestId('category-inline-name-input'), 'PaidHidCreate');
    await user.click(screen.getByTestId('category-inline-submit'));

    await waitFor(() => {
      expect(
        screen.getByTestId(`category-chip--${categoryChipTestIdSlug('PaidHidCreate')}`),
      ).toBeInTheDocument();
    });
    expect(readWorkspaceCategories(hiddenKey)).toContain('PaidHidCreate');

    await pushWorkspaceToSupabase(hiddenKey);

    const wid = workspaceUuidForStorageKey(hiddenKey);
    await waitFor(async () => {
      const rows = await getCategories(wid);
      expect(rows.some((r) => r.name === 'PaidHidCreate')).toBe(true);
    });
  });

  it('deletes category; second push removes remote row', async () => {
    const { hiddenKey, switchName } = seedHomePlusHiddenWorkspace('paidhidde');
    await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home', hiddenKey]);

    renderHomePage();
    await waitForCategoryRowReady({ expectPaidSync: true });

    const base = getDefaultWorkspaceData();
    saveWorkspace(hiddenKey, { ...base, categories: ['PaidHidDel'] });
    window.dispatchEvent(new CustomEvent('plainsight:workspace-storage-mutated'));

    await switchToHiddenWorkspaceName(switchName);
    await screen.findByTestId(`category-chip--${categoryChipTestIdSlug('PaidHidDel')}`);
    await settlePaidSyncAfterWorkspaceSwitch();

    await pushWorkspaceToSupabase(hiddenKey);

    const hidWid = workspaceUuidForStorageKey(hiddenKey);
    let rowId = '';
    await waitFor(async () => {
      const rows = await getCategories(hidWid);
      const row = rows.find((r) => r.name === 'PaidHidDel');
      expect(row).toBeTruthy();
      rowId = row!.id;
    });

    const user = userEvent.setup();
    const chip = await screen.findByTestId(`category-chip--${categoryChipTestIdSlug('PaidHidDel')}`);
    fireEvent.contextMenu(chip);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await user.click(screen.getByTestId('mock-confirm-ok'));

    await waitFor(() => {
      expect(screen.queryByText('PaidHidDel', { selector: 'button' })).not.toBeInTheDocument();
    });
    expect(readWorkspaceCategories(hiddenKey)).not.toContain('PaidHidDel');

    await settlePaidSyncAfterWorkspaceSwitch();
    await pushWorkspaceToSupabase(hiddenKey);

    await waitFor(async () => {
      expect(await getCategoryById(rowId)).toBeNull();
      const rows = await getCategories(hidWid);
      expect(rows.some((r) => r.name === 'PaidHidDel')).toBe(false);
    });
  });
});
