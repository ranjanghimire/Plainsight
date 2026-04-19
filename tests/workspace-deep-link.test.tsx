/**
 * WorkspacePage: valid /w/:workspace loads the correct workspace data.
 *
 * Note: full `AppRoutes` includes `RedirectWorkspaceOnLoad`, which replaces any initial
 * `/w/*` or `/ws/*` URL with `/` on first paint (see `browser-history-workspace-lock.test.tsx`).
 * These tests mount `WorkspacePage` on its own route so we exercise the page logic without
 * that redirect.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/context/AuthContext';
import { ArchiveModeProvider } from '../src/context/ArchiveModeContext';
import { SyncEntitlementProvider } from '../src/context/SyncEntitlementContext';
import { TagsNavProvider } from '../src/context/TagsNavContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';
import { WorkspacePage } from '../src/pages/WorkspacePage';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  seedFreshHomeWorkspace,
  seedHomePlusHiddenWorkspace,
  WorkspaceTestBridge,
} from './categoryTestHarness';
import { loadWorkspace, saveWorkspace } from '../src/utils/storage';

function renderWorkspaceRoute(initialEntries: string[]) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SyncEntitlementProvider>
          <WorkspaceProvider>
            <MemoryRouter initialEntries={initialEntries}>
              <ArchiveModeProvider>
                <TagsNavProvider>
                  <WorkspaceTestBridge />
                  <Routes>
                    <Route path="/w/:workspace" element={<WorkspacePage />} />
                  </Routes>
                </TagsNavProvider>
              </ArchiveModeProvider>
            </MemoryRouter>
          </WorkspaceProvider>
        </SyncEntitlementProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearPlainsightStorage();
  configureFreeUserTestMode();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WorkspacePage (isolated route)', () => {
  it('/w/home loads workspace_home notes shell', async () => {
    seedFreshHomeWorkspace();
    renderWorkspaceRoute(['/w/home']);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'New note' })).toBeInTheDocument();
    });
  });

  it('/w/:slug loads legacy hidden workspace notes', async () => {
    const { hiddenKey, switchName } = seedHomePlusHiddenWorkspace('deeplinkhid');
    saveWorkspace(hiddenKey, {
      ...loadWorkspace(hiddenKey),
      notes: [{ id: 'n-dl-1', text: 'only in hidden deeplink', category: null }],
    });
    renderWorkspaceRoute([`/w/${switchName}`]);
    await waitFor(() => {
      expect(screen.getAllByText('only in hidden deeplink').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByRole('textbox', { name: 'New note' })).toBeInTheDocument();
  });
});
