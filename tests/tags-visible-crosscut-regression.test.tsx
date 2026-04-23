import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ArchiveModeProvider } from '../src/context/ArchiveModeContext';
import { SyncEntitlementProvider } from '../src/context/SyncEntitlementContext';
import { TagsNavProvider } from '../src/context/TagsNavContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  seedHomePlusVisibleWorkspace,
  seedHomePlusHiddenWorkspace,
  seedFreshHomeWorkspace,
  switchToVisibleWorkspaceEntry,
  WorkspaceTestBridge,
} from './categoryTestHarness';
import { loadWorkspace, saveWorkspace } from '../src/utils/storage';
import { resetSyncQueueForTests } from '../src/sync/syncHelpers';

function renderFullApp(initialEntries: string[] = ['/']) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SyncEntitlementProvider>
          <WorkspaceProvider>
            <MemoryRouter initialEntries={initialEntries}>
              <ArchiveModeProvider>
                <TagsNavProvider>
                  <WorkspaceTestBridge />
                  <AppRoutes />
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
  seedFreshHomeWorkspace();
});

afterEach(() => {
  cleanup();
  resetSyncQueueForTests();
});

describe('Tags — visible crosscut scope regression', () => {
  it('Tags view on Home includes tags from all visible workspaces and excludes hidden tags', async () => {
    const { entry } = seedHomePlusVisibleWorkspace('VisTagTab');
    const { hiddenKey } = seedHomePlusHiddenWorkspace('hidtags');
    saveWorkspace('workspace_home', {
      ...loadWorkspace('workspace_home'),
      notes: [{ id: 'n-home', text: '#home_tag\nhome body', category: null }],
    });
    saveWorkspace(entry.key, {
      ...loadWorkspace(entry.key),
      notes: [{ id: 'n-vis', text: '#visible_tab_tag\nvis body', category: null }],
    });
    saveWorkspace(hiddenKey, {
      ...loadWorkspace(hiddenKey),
      notes: [{ id: 'n-hid', text: '#hidden_tag\nhidden body', category: null }],
    });

    const user = userEvent.setup();
    renderFullApp(['/']);

    await user.click(screen.getByRole('button', { name: 'Tags' }));
    await waitFor(() =>
      expect(screen.getByText('Showing visible workspace tags')).toBeInTheDocument(),
    );

    expect(screen.getByText('#home_tag')).toBeInTheDocument();
    expect(screen.getByText('#visible_tab_tag')).toBeInTheDocument();
    expect(screen.queryByText('#hidden_tag')).not.toBeInTheDocument();

    // sanity: switching visible workspace doesn't change the "visible tags" scope
    await user.click(screen.getByRole('button', { name: '← Back' }));
    await switchToVisibleWorkspaceEntry(entry);
    await user.click(screen.getByRole('button', { name: 'Tags' }));
    await waitFor(() =>
      expect(screen.getByText('Showing visible workspace tags')).toBeInTheDocument(),
    );
    expect(screen.getByText('#home_tag')).toBeInTheDocument();
    expect(screen.getByText('#visible_tab_tag')).toBeInTheDocument();
    expect(screen.queryByText('#hidden_tag')).not.toBeInTheDocument();
  });
});

