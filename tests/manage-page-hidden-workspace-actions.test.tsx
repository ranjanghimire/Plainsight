import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  seedFreshHomeWorkspace,
  seedHomePlusHiddenWorkspace,
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

describe('ManagePage — hidden workspace actions', () => {
  it('clicking a workspace loads that space (and its notes)', async () => {
    const { hiddenKey, switchName } = seedHomePlusHiddenWorkspace('mnav');
    saveWorkspace(hiddenKey, {
      ...loadWorkspace(hiddenKey),
      notes: [{ id: 'n1', text: 'note only in managed hidden', category: null }],
    });
    const user = userEvent.setup();
    renderFullApp(['/manage']);

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 2, name: 'Hidden Workspaces' }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: /mnav/i }));

    await waitFor(() => {
      expect(screen.getAllByText('note only in managed hidden').length).toBeGreaterThanOrEqual(1);
    });
    // Ensure the route load preserved workspace scoping (we should not be on the manage list anymore).
    expect(screen.queryByRole('heading', { level: 2, name: 'Hidden Workspaces' })).not.toBeInTheDocument();
    // Switch name sanity
    expect(switchName).toBe('mnav');
  });

  it('rename in ManagePage moves the hidden blob key', async () => {
    const { hiddenKey } = seedHomePlusHiddenWorkspace('rename_me');
    saveWorkspace(hiddenKey, {
      ...loadWorkspace(hiddenKey),
      notes: [{ id: 'n1', text: 'kept through rename', category: null }],
    });
    const user = userEvent.setup();
    renderFullApp(['/manage']);

    const rowButton = await screen.findByRole('button', { name: /rename_me/i });
    const li = rowButton.closest('li');
    expect(li).toBeTruthy();
    await user.click(within(li!).getByRole('button', { name: 'Rename' }));
    const input = await within(li!).findByDisplayValue(/rename_me/i);
    await user.clear(input);
    await user.type(input, 'renamed hidden');
    await user.click(within(li!).getByRole('button', { name: 'Save' }));

    const nextKey = 'workspace_renamed_hidden';
    await waitFor(() => {
      expect(loadWorkspace(nextKey).notes?.[0]?.text).toBe('kept through rename');
    });
  });

  it('delete in ManagePage removes the hidden workspace entry', async () => {
    const { hiddenKey } = seedHomePlusHiddenWorkspace('deleteme');
    saveWorkspace(hiddenKey, {
      ...loadWorkspace(hiddenKey),
      notes: [{ id: 'n1', text: 'to be deleted', category: null }],
    });
    const user = userEvent.setup();
    renderFullApp(['/manage']);

    const rowButton = await screen.findByRole('button', { name: /deleteme/i });
    const li = rowButton.closest('li');
    expect(li).toBeTruthy();
    await user.click(within(li!).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete workspace' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /deleteme/i })).not.toBeInTheDocument();
    });
  });
});

