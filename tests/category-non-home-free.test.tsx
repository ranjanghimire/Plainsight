/**
 * Free user: create/delete categories on menu-visible and hidden workspaces (same UX as Home).
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { categoryChipTestIdSlug } from '../src/components/CategoryChips';
import * as syncEngine from '../src/sync/syncEngine';
import { getDefaultWorkspaceData, saveWorkspace } from '../src/utils/storage';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  readWorkspaceCategories,
  renderHomePage,
  seedHomePlusHiddenWorkspace,
  seedHomePlusVisibleWorkspace,
  switchToHiddenWorkspaceName,
  switchToVisibleWorkspaceEntry,
  waitForCategoryRowReady,
} from './categoryTestHarness';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('free user — visible (non-home) workspace categories', () => {
  beforeEach(() => {
    clearPlainsightStorage();
    configureFreeUserTestMode();
  });

  it('creates a category on a second visible tab; fullSync not called', async () => {
    const fullSyncSpy = vi.spyOn(syncEngine, 'fullSync');
    const { entry, visKey } = seedHomePlusVisibleWorkspace('VisFreeTab');
    renderHomePage();
    await waitForCategoryRowReady();

    await switchToVisibleWorkspaceEntry(entry);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('category-chip--add'));
    await user.type(screen.getByTestId('category-inline-name-input'), 'VisFreeNewCat');
    await user.click(screen.getByTestId('category-inline-submit'));

    await waitFor(() => {
      expect(
        screen.getByTestId(`category-chip--${categoryChipTestIdSlug('VisFreeNewCat')}`),
      ).toBeInTheDocument();
    });
    expect(readWorkspaceCategories(visKey)).toContain('VisFreeNewCat');
    expect(fullSyncSpy).not.toHaveBeenCalled();
  });

  it('deletes a category on a second visible tab; fullSync not called', async () => {
    const fullSyncSpy = vi.spyOn(syncEngine, 'fullSync');
    const { entry, visKey } = seedHomePlusVisibleWorkspace('VisFreeDelTab');
    const base = getDefaultWorkspaceData();
    saveWorkspace(entry.key, { ...base, categories: ['VisFreeDelSeed'] });

    renderHomePage();
    await waitForCategoryRowReady();
    await switchToVisibleWorkspaceEntry(entry);

    const user = userEvent.setup();
    const chip = await screen.findByTestId(`category-chip--${categoryChipTestIdSlug('VisFreeDelSeed')}`);
    fireEvent.contextMenu(chip);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await user.click(screen.getByTestId('mock-confirm-ok'));

    await waitFor(() => {
      expect(screen.queryByText('VisFreeDelSeed', { selector: 'button' })).not.toBeInTheDocument();
    });
    expect(readWorkspaceCategories(visKey)).not.toContain('VisFreeDelSeed');
    expect(fullSyncSpy).not.toHaveBeenCalled();
  });
});

describe('free user — hidden workspace categories', () => {
  beforeEach(() => {
    clearPlainsightStorage();
    configureFreeUserTestMode();
  });

  it('creates a category on a hidden workspace; fullSync not called', async () => {
    const fullSyncSpy = vi.spyOn(syncEngine, 'fullSync');
    const { hiddenKey, switchName } = seedHomePlusHiddenWorkspace('hidfreecat');
    renderHomePage();
    await waitForCategoryRowReady();

    await switchToHiddenWorkspaceName(switchName);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('category-chip--add'));
    await user.type(screen.getByTestId('category-inline-name-input'), 'HidFreeNewCat');
    await user.click(screen.getByTestId('category-inline-submit'));

    await waitFor(() => {
      expect(
        screen.getByTestId(`category-chip--${categoryChipTestIdSlug('HidFreeNewCat')}`),
      ).toBeInTheDocument();
    });
    expect(readWorkspaceCategories(hiddenKey)).toContain('HidFreeNewCat');
    expect(fullSyncSpy).not.toHaveBeenCalled();
  });

  it('deletes a category on a hidden workspace; fullSync not called', async () => {
    const fullSyncSpy = vi.spyOn(syncEngine, 'fullSync');
    const { hiddenKey, switchName } = seedHomePlusHiddenWorkspace('hidfreedel');
    const base = getDefaultWorkspaceData();
    saveWorkspace(hiddenKey, { ...base, categories: ['HidFreeDelSeed'] });

    renderHomePage();
    await waitForCategoryRowReady();
    await switchToHiddenWorkspaceName(switchName);

    const user = userEvent.setup();
    const chip = await screen.findByTestId(`category-chip--${categoryChipTestIdSlug('HidFreeDelSeed')}`);
    fireEvent.contextMenu(chip);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await user.click(screen.getByTestId('mock-confirm-ok'));

    await waitFor(() => {
      expect(screen.queryByText('HidFreeDelSeed', { selector: 'button' })).not.toBeInTheDocument();
    });
    expect(readWorkspaceCategories(hiddenKey)).not.toContain('HidFreeDelSeed');
    expect(fullSyncSpy).not.toHaveBeenCalled();
  });
});
