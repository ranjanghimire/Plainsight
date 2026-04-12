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
});
