/**
 * Categories shown for one workspace must not appear after switching to another (visible or hidden).
 */

import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { categoryChipTestIdSlug } from '../src/components/CategoryChips';
import { getDefaultWorkspaceData, saveWorkspace } from '../src/utils/storage';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  HOME_VISIBLE_ENTRY,
  renderHomePage,
  seedHomePlusHiddenWorkspace,
  seedHomePlusVisibleWorkspace,
  switchToHiddenWorkspaceName,
  switchToVisibleWorkspaceEntry,
  waitForCategoryRowReady,
} from './categoryTestHarness';

describe('category isolation between workspaces (free user)', () => {
  beforeEach(() => {
    clearPlainsightStorage();
    configureFreeUserTestMode();
  });

  it('does not show a second visible tab’s categories on Home (and vice versa)', async () => {
    const { entry } = seedHomePlusVisibleWorkspace('IsoVisTab');
    const base = getDefaultWorkspaceData();
    saveWorkspace('workspace_home', { ...base, categories: ['OnlyOnHome'] });
    saveWorkspace(entry.key, { ...base, categories: ['OnlyOnVisibleTab'] });

    renderHomePage();
    await waitForCategoryRowReady();

    await waitFor(() => {
      expect(
        screen.getByTestId(`category-chip--${categoryChipTestIdSlug('OnlyOnHome')}`),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId(`category-chip--${categoryChipTestIdSlug('OnlyOnVisibleTab')}`),
    ).not.toBeInTheDocument();

    await switchToVisibleWorkspaceEntry(entry);

    await waitFor(() => {
      expect(
        screen.getByTestId(`category-chip--${categoryChipTestIdSlug('OnlyOnVisibleTab')}`),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId(`category-chip--${categoryChipTestIdSlug('OnlyOnHome')}`),
    ).not.toBeInTheDocument();

    await switchToVisibleWorkspaceEntry(HOME_VISIBLE_ENTRY);

    await waitFor(() => {
      expect(
        screen.getByTestId(`category-chip--${categoryChipTestIdSlug('OnlyOnHome')}`),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId(`category-chip--${categoryChipTestIdSlug('OnlyOnVisibleTab')}`),
    ).not.toBeInTheDocument();
  });

  it('does not show a hidden workspace’s categories on Home (and vice versa)', async () => {
    const { hiddenKey, switchName } = seedHomePlusHiddenWorkspace('isohid');
    const base = getDefaultWorkspaceData();
    saveWorkspace('workspace_home', { ...base, categories: ['HomeHiddenIso'] });
    saveWorkspace(hiddenKey, { ...base, categories: ['HiddenWsIso'] });

    renderHomePage();
    await waitForCategoryRowReady();

    await waitFor(() => {
      expect(
        screen.getByTestId(`category-chip--${categoryChipTestIdSlug('HomeHiddenIso')}`),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId(`category-chip--${categoryChipTestIdSlug('HiddenWsIso')}`),
    ).not.toBeInTheDocument();

    await switchToHiddenWorkspaceName(switchName);

    await waitFor(() => {
      expect(
        screen.getByTestId(`category-chip--${categoryChipTestIdSlug('HiddenWsIso')}`),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId(`category-chip--${categoryChipTestIdSlug('HomeHiddenIso')}`),
    ).not.toBeInTheDocument();

    await switchToHiddenWorkspaceName('home');

    await waitFor(() => {
      expect(
        screen.getByTestId(`category-chip--${categoryChipTestIdSlug('HomeHiddenIso')}`),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId(`category-chip--${categoryChipTestIdSlug('HiddenWsIso')}`),
    ).not.toBeInTheDocument();
  });
});
