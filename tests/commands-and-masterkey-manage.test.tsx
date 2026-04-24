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
  seedFreshHomeWorkspace,
  WorkspaceTestBridge,
  seedHomePlusHiddenWorkspace,
} from './categoryTestHarness';
import { getMasterKey, loadWorkspace } from '../src/utils/storage';
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

async function runComposerCommand(user: ReturnType<typeof userEvent.setup>, cmd: string) {
  const box = screen.getByRole('textbox', { name: 'New note' });
  await user.click(box);
  await user.clear(box);
  await user.type(box, cmd);
  await user.click(screen.getByRole('button', { name: 'Add note' }));
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

describe('dot-commands + master key manage entry', () => {
  it('dot-command opens (or creates) a hidden workspace and does not create a note', async () => {
    seedHomePlusHiddenWorkspace('cmdhid');
    const user = userEvent.setup();
    renderFullApp(['/']);

    await runComposerCommand(user, '.cmdhid');

    await waitFor(() => {
      // Route load uses WorkspaceContext; safest assertion is the workspace blob is active and no note inserted.
      const d = loadWorkspace('workspace_cmdhid');
      expect(Array.isArray(d.notes)).toBe(true);
      expect(d.notes.length).toBe(0);
    });

    expect(
      screen.getByRole('img', { name: 'Hidden workspace (not in menu)' }),
    ).toBeInTheDocument();
  });

  it('first-time double-dot sets master key and navigates to /manage', async () => {
    const user = userEvent.setup();
    renderFullApp(['/']);

    await runComposerCommand(user, '..open-sesame');

    await waitFor(() => {
      expect(getMasterKey()).toBe('..open-sesame');
      expect(screen.getByRole('heading', { level: 2, name: 'Hidden Workspaces' })).toBeInTheDocument();
    });
  });

  it('wrong master key does not navigate to /manage', async () => {
    const user = userEvent.setup();
    renderFullApp(['/']);
    await runComposerCommand(user, '..right-key');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Hidden Workspaces' })).toBeInTheDocument());

    // Back to home
    await user.click(screen.getByRole('button', { name: '← Back' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'New note' })).toBeInTheDocument());

    await runComposerCommand(user, '..wrong-key');

    // Still on home; manage heading should not appear again.
    expect(screen.queryByRole('heading', { level: 2, name: 'Hidden Workspaces' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'New note' })).toBeInTheDocument();
  });
});

