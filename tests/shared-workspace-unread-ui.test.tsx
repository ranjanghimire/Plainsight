import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Avoid real hydration/supabase work in this unit UI test.
vi.mock('../src/sync/syncHelpers', async () => {
  const actual = await vi.importActual<typeof import('../src/sync/syncHelpers')>(
    '../src/sync/syncHelpers',
  );
  return {
    ...actual,
    queueFullSync: vi.fn(async () => {}),
    runInitialHydration: vi.fn(async () => {}),
  };
});
vi.mock('../src/sync/supabaseClient', async () => {
  const actual = await vi.importActual<typeof import('../src/sync/supabaseClient')>(
    '../src/sync/supabaseClient',
  );
  return {
    ...actual,
    whenRealtimeAuthReady: vi.fn(async () => {}),
    refreshSupabaseRealtimeJwt: vi.fn(async () => {}),
  };
});
vi.mock('../src/sync/syncEngine', async () => {
  const actual = await vi.importActual<typeof import('../src/sync/syncEngine')>(
    '../src/sync/syncEngine',
  );
  return {
    ...actual,
    subscribeToWorkspaces: vi.fn(() => () => {}),
    subscribeToWorkspacePins: vi.fn(() => () => {}),
    subscribeToNotes: vi.fn(() => () => {}),
    subscribeToCategories: vi.fn(() => () => {}),
    subscribeToArchivedNotes: vi.fn(() => () => {}),
  };
});

import { AppRoutes } from '../src/App';
import { ThemeProvider } from '../src/context/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import { SyncEntitlementProvider } from '../src/context/SyncEntitlementContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';
import { ArchiveModeProvider } from '../src/context/ArchiveModeContext';
import { TagsNavProvider } from '../src/context/TagsNavContext';
import { setSession } from '../src/auth/localSession';
import { setSyncEntitlementActive, setSyncRemoteActive } from '../src/sync/syncEnabled';
import { notifyHydrationComplete } from '../src/sync/hydrationBridge';

// Provided by the sharedWorkspaces test mock in tests/setup.ts
// eslint-disable-next-line @typescript-eslint/naming-convention
import { __emitWorkspaceActivityLog } from '../src/sync/sharedWorkspaces';

function renderApp() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SyncEntitlementProvider>
          <WorkspaceProvider>
            <MemoryRouter initialEntries={['/']}>
              <ArchiveModeProvider>
                <TagsNavProvider>
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

describe('shared workspace unread badge (UI)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    // Paid + logged in for shared workspaces
    globalThis.__PS_TEST_FLAGS__ = {
      paidSync: true,
      sessionUserId: '11111111-1111-4111-8111-111111111111',
    };
    setSession('vitest-session-token', globalThis.__PS_TEST_FLAGS__.sessionUserId);
    setSyncEntitlementActive(true);
    setSyncRemoteActive(true);
  });

  it(
    'marks unread on user2 activity, clears on open, and stays cleared after 5s',
    async () => {
      const user = userEvent.setup();
    renderApp();
      // Simulate "hydration complete" so shared workspaces populate in menu.
      notifyHydrationComplete({ ok: true });

      await screen.findByRole('heading', { level: 1, name: 'Plainsight' });

      // Open menu first so WorkspaceProvider has time to build shared rows and subscribe.
      await openMenu(user);
      await screen.findByText('Shared Owner Workspace');

      // Emit activity by another user on the shared workspace mock id.
      __emitWorkspaceActivityLog('ws-shared-owner', {
        event: 'INSERT',
        newRow: {
          id: 'log-remote-1',
          workspace_id: 'ws-shared-owner',
          actor_user_id: '22222222-2222-4222-8222-222222222222',
          actor_email: 'user2@plainsight.test',
          action: 'note_added',
          summary: 'Added note',
          details: {},
          created_at: new Date().toISOString(),
        },
        oldRow: null,
      });

      // Unread dot should appear next to the shared workspace row.
      const sharedRow = screen.getByRole('button', { name: /Shared Owner Workspace/i });
      await waitFor(() => {
        expect(within(sharedRow).getByLabelText('Unread changes')).toBeInTheDocument();
      });

    // Also header menu button should show badge (same aria label).
      const menuButton = screen.getByRole('button', { name: 'Open menu' });
      expect(menuButton.querySelector('span')).toBeTruthy();

    // Click shared workspace to open it; unread dot should clear.
      await user.click(sharedRow);
      // Menu closes; reopen and confirm dot is gone.
      await openMenu(user);
      const sharedRowAfter = screen.getByRole('button', { name: /Shared Owner Workspace/i });
      expect(within(sharedRowAfter).queryByLabelText('Unread changes')).toBeNull();

    // Wait 5 seconds; dot should not come back on its own.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5_000);
      });
      expect(within(sharedRowAfter).queryByLabelText('Unread changes')).toBeNull();
    },
    20_000,
  );
});

