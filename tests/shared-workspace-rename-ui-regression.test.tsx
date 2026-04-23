import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  seedHomePlusVisibleWorkspace,
  WorkspaceTestBridge,
} from './categoryTestHarness';
import { resetSyncQueueForTests } from '../src/sync/syncHelpers';

function renderFullApp() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SyncEntitlementProvider>
          <WorkspaceProvider>
            <MemoryRouter initialEntries={['/']}>
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

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open menu' }));
  await waitFor(() => expect(screen.getByTestId('menu-panel')).toBeInTheDocument());
}

function enablePaidMenuTestMode(userId = '44444444-4444-4444-8444-444444444444') {
  globalThis.__PS_TEST_FLAGS__ = {
    paidSync: true,
    sessionUserId: userId,
  };
  localStorage.setItem('plainsight_local_user_id', userId);
  localStorage.setItem('plainsight_local_session_token', 'session-paid');
  localStorage.setItem('plainsight_auth_display_email', 'vitest@plainsight.test');
  localStorage.setItem('plainsight_sync_remote_active', '1');
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearPlainsightStorage();
  enablePaidMenuTestMode();
  seedHomePlusVisibleWorkspace('SeedTab');
});

afterEach(() => {
  cleanup();
  resetSyncQueueForTests();
});

describe('Shared Workspaces — rename regression', () => {
  it('context menu Rename on a shared workspace opens the inline rename editor', async () => {
    const user = userEvent.setup();
    renderFullApp();
    await openMenu(user);

    // Provided by mocked listWorkspaceShares() in tests/setup.ts; wait for any shared UI to arrive.
    await waitFor(() => {
      expect(screen.getByText('Shared Workspaces')).toBeInTheDocument();
    });
    const rowText = await screen.findByText('Shared Owner Workspace');
    const row = rowText.closest('button');
    expect(row).toBeTruthy();
    fireEvent.contextMenu(row, {
      clientX: 80,
      clientY: 120,
      bubbles: true,
      preventDefault: vi.fn(),
    });
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    expect(await screen.findByDisplayValue('Shared Owner Workspace')).toBeInTheDocument();
  });
});

