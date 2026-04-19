/**
 * NoteCard + NotesView: delete active note → archive, restore, permanent delete from archive.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from '../src/pages/HomePage';
import { ArchiveModeProvider, useArchiveMode } from '../src/context/ArchiveModeContext';
import { TagsNavProvider } from '../src/context/TagsNavContext';
import { AuthProvider } from '../src/context/AuthContext';
import { SyncEntitlementProvider } from '../src/context/SyncEntitlementContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  seedFreshHomeWorkspace,
  WorkspaceTestBridge,
} from './categoryTestHarness';
import { loadWorkspace } from '../src/utils/storage';
import { resetSyncQueueForTests } from '../src/sync/syncHelpers';
import * as syncEngine from '../src/sync/syncEngine';

/** Home has no app header in isolation — drive archive mode the same way as the header toggle. */
function HomeWithArchiveToggle() {
  const { toggleArchiveMode } = useArchiveMode();
  return (
    <div>
      <button type="button" aria-label="Toggle archive test" onClick={() => toggleArchiveMode()}>
        Archive
      </button>
      <HomePage />
    </div>
  );
}

function renderHomeWithArchive() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SyncEntitlementProvider>
          <WorkspaceProvider>
            <MemoryRouter initialEntries={['/']}>
              <WorkspaceTestBridge />
              <TagsNavProvider>
                <ArchiveModeProvider>
                  <Routes>
                    <Route path="/" element={<HomeWithArchiveToggle />} />
                  </Routes>
                </ArchiveModeProvider>
              </TagsNavProvider>
            </MemoryRouter>
          </WorkspaceProvider>
        </SyncEntitlementProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * NotesView renders prev / current / next category swipe columns, so the same note body text
 * can appear multiple times in the DOM — target the center column (index 1 of 3).
 */
function centerSwipePick<T extends Element>(elements: T[]): T {
  return elements.length === 3 ? elements[1]! : elements[0]!;
}

function getNoteBodyClickTarget(text: string) {
  return centerSwipePick(screen.getAllByText(text));
}

/** Prev/current/next category columns duplicate note actions — use the center column. */
function getCenterRoleButton(name: string | RegExp) {
  return centerSwipePick(screen.getAllByRole('button', { name }));
}

/** NoteCard reveals meta row after a single tap and a short delay. */
async function revealNoteMeta(user: ReturnType<typeof userEvent.setup>, text: string) {
  const body = getNoteBodyClickTarget(text);
  await user.click(body);
  await sleep(320);
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearPlainsightStorage();
  configureFreeUserTestMode();
  seedFreshHomeWorkspace();
  vi.spyOn(syncEngine, 'fullSync').mockResolvedValue({ ok: true, error: null });
});

afterEach(() => {
  resetSyncQueueForTests();
});

describe('note lifecycle (free, local)', () => {
  it('deletes an active note into archive after meta + trash + animation', async () => {
    const user = userEvent.setup();
    renderHomeWithArchive();
    const main = screen.getByRole('textbox', { name: 'New note' });
    await user.click(main);
    await user.type(main, 'alpha lifecycle note');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => {
      expect(screen.getAllByText('alpha lifecycle note').length).toBeGreaterThan(0);
    });

    await revealNoteMeta(user, 'alpha lifecycle note');
    await user.click(getCenterRoleButton('Delete note'));
    await sleep(250);
    await waitFor(() => {
      expect(loadWorkspace('workspace_home').notes?.length ?? 0).toBe(0);
      expect(loadWorkspace('workspace_home').archivedNotes?.['alpha lifecycle note']).toBeTruthy();
    });
  });

  it('restores an archived note back to the active list', async () => {
    const user = userEvent.setup();
    renderHomeWithArchive();
    const main = screen.getByRole('textbox', { name: 'New note' });
    await user.click(main);
    await user.type(main, 'restore me body');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() =>
      expect(screen.getAllByText('restore me body').length).toBeGreaterThan(0),
    );
    await revealNoteMeta(user, 'restore me body');
    await user.click(getCenterRoleButton('Delete note'));
    await sleep(250);
    await waitFor(() =>
      expect(screen.queryAllByText('restore me body').length).toBe(0),
    );

    await user.click(screen.getByRole('button', { name: 'Toggle archive test' }));
    await sleep(200);
    await waitFor(() =>
      expect(screen.getAllByText(/Archived items/i).length).toBeGreaterThan(0),
    );
    await waitFor(() =>
      expect(screen.getAllByText('restore me body').length).toBeGreaterThan(0),
    );
    await revealNoteMeta(user, 'restore me body');
    await user.click(getCenterRoleButton('Restore note'));
    await sleep(200);
    await user.click(screen.getByRole('button', { name: 'Toggle archive test' }));
    await sleep(200);
    await waitFor(() => {
      expect(screen.getAllByText('restore me body').length).toBeGreaterThan(0);
      expect(loadWorkspace('workspace_home').notes?.length ?? 0).toBeGreaterThan(0);
    });
  });

  it('permanently removes an archived note from the archive map', async () => {
    const user = userEvent.setup();
    renderHomeWithArchive();
    const main = screen.getByRole('textbox', { name: 'New note' });
    await user.click(main);
    await user.type(main, 'gone forever');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() =>
      expect(screen.getAllByText('gone forever').length).toBeGreaterThan(0),
    );
    await revealNoteMeta(user, 'gone forever');
    await user.click(getCenterRoleButton('Delete note'));
    await sleep(250);

    await user.click(screen.getByRole('button', { name: 'Toggle archive test' }));
    await sleep(200);
    await waitFor(() =>
      expect(screen.getAllByText('gone forever').length).toBeGreaterThan(0),
    );
    await revealNoteMeta(user, 'gone forever');
    await user.click(getCenterRoleButton('Delete archived note permanently'));
    await sleep(220);
    await waitFor(() => {
      expect(loadWorkspace('workspace_home').archivedNotes?.['gone forever']).toBeUndefined();
    });
  });
});
