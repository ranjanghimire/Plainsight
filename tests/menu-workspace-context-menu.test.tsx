/**
 * MenuPanel: workspace row context menu (rename) via fine-pointer contextmenu.
 */
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
  configureFreeUserTestMode,
  seedHomePlusVisibleWorkspace,
  WorkspaceTestBridge,
} from './categoryTestHarness';
import { loadAppState } from '../src/utils/storage';
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

beforeEach(() => {
  vi.restoreAllMocks();
  clearPlainsightStorage();
  configureFreeUserTestMode();
});

afterEach(() => {
  cleanup();
  resetSyncQueueForTests();
});

describe('MenuPanel workspace context menu', () => {
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

  it('opens rename inline editor from context menu → Rename', async () => {
    seedHomePlusVisibleWorkspace('CtxWs');
    const user = userEvent.setup();
    renderFullApp();
    await openMenu(user);
    const row = screen.getByRole('button', { name: 'CtxWs' });
    fireEvent.contextMenu(row, { clientX: 80, clientY: 120, bubbles: true, preventDefault: vi.fn() });
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const input = await screen.findByDisplayValue('CtxWs');
    expect(input).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'RenamedCtx');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      const names = (loadAppState().visibleWorkspaces || []).map((e) => e.name);
      expect(names).toContain('RenamedCtx');
    });
  });

  it('shows Share action for visible workspace context menu', async () => {
    enablePaidMenuTestMode();
    seedHomePlusVisibleWorkspace('ShareMe');
    const user = userEvent.setup();
    renderFullApp();
    await openMenu(user);
    const row = screen.getByRole('button', { name: 'ShareMe' });
    fireEvent.contextMenu(row, {
      clientX: 90,
      clientY: 140,
      bubbles: true,
      preventDefault: vi.fn(),
    });
    expect(await screen.findByRole('menuitem', { name: 'Share' })).toBeInTheDocument();
  });

  it('shows Shared Workspaces section with accept CTA for paid users', async () => {
    enablePaidMenuTestMode();
    seedHomePlusVisibleWorkspace('SharedRoot');

    const user = userEvent.setup();
    renderFullApp();
    await openMenu(user);

    expect(screen.getByText('Shared Workspaces')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText('No shared workspaces yet.'),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    });
  });
});
