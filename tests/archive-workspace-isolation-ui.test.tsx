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
  seedFreshHomeWorkspace,
  switchToVisibleWorkspaceEntry,
  WorkspaceTestBridge,
} from './categoryTestHarness';
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

async function addNote(user: ReturnType<typeof userEvent.setup>, text: string) {
  const box = screen.getByRole('textbox', { name: 'New note' });
  await user.click(box);
  await user.type(box, text);
  await user.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect(screen.getAllByText(text).length).toBeGreaterThanOrEqual(1));
}

async function deleteNote(user: ReturnType<typeof userEvent.setup>, text: string) {
  // reveal meta row by clicking body then click "Delete note"
  const body = screen.getAllByText(text)[0]!;
  await user.click(body);
  await new Promise((r) => setTimeout(r, 260));
  const delButtons = screen.getAllByRole('button', { name: 'Delete note' });
  // NotesView renders prev/current/next columns; pick the center action to avoid duplicates.
  const btn = delButtons.length === 3 ? delButtons[1]! : delButtons[0]!;
  await user.click(btn);
  await waitFor(() => expect(screen.queryByText(text)).not.toBeInTheDocument());
}

async function enterArchive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Archive and history/i }));
  await waitFor(() =>
    expect(screen.getAllByText(/Archived items/i).length).toBeGreaterThanOrEqual(1),
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

describe('Archive — workspace isolation', () => {
  it('archive shows only entries from the current workspace', async () => {
    const { entry } = seedHomePlusVisibleWorkspace('IsoTab');
    const user = userEvent.setup();
    renderFullApp(['/']);

    await addNote(user, 'home note to archive');
    await deleteNote(user, 'home note to archive');
    await enterArchive(user);
    expect(screen.getAllByText('home note to archive').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('tab note to archive')).not.toBeInTheDocument();

    // Exit archive, switch workspace, archive there
    await user.click(screen.getByRole('button', { name: /Exit archive/i }));
    await switchToVisibleWorkspaceEntry(entry);
    await addNote(user, 'tab note to archive');
    await deleteNote(user, 'tab note to archive');
    await enterArchive(user);

    expect(screen.getAllByText('tab note to archive').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('home note to archive')).not.toBeInTheDocument();
  });
});

