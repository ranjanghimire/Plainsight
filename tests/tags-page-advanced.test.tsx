/**
 * TagsPage: filter query, expand row, tag rename + delete (ConfirmDialog mocked globally).
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
  seedFreshHomeWorkspace,
  WorkspaceTestBridge,
} from './categoryTestHarness';
import { loadWorkspace, saveWorkspace } from '../src/utils/storage';
import { resetSyncQueueForTests } from '../src/sync/syncHelpers';

function renderFullApp(initialEntries: string[] = ['/tags']) {
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

describe('TagsPage — filter and expand', () => {
  it('filters the tag list by substring', async () => {
    saveWorkspace('workspace_home', {
      ...loadWorkspace('workspace_home'),
      notes: [
        { id: '1', text: '#apple\na', category: null },
        { id: '2', text: '#banana\nb', category: null },
      ],
    });
    const user = userEvent.setup();
    renderFullApp(['/tags']);
    await waitFor(() => expect(screen.getByText('#apple')).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText('Filter tags…'), 'ban');
    expect(screen.getByText(/Showing 1 tag matching/i)).toBeInTheDocument();
    expect(screen.queryByText('#apple')).not.toBeInTheDocument();
    expect(screen.getByText('#banana')).toBeInTheDocument();
  });

  it('expands a tag row to show note previews', async () => {
    saveWorkspace('workspace_home', {
      ...loadWorkspace('workspace_home'),
      notes: [{ id: '1', text: '#expandme\npreview line', category: null }],
    });
    const user = userEvent.setup();
    renderFullApp(['/tags']);
    await waitFor(() => expect(screen.getByText('#expandme')).toBeInTheDocument());
    await user.click(screen.getByText('#expandme'));
    await waitFor(() => expect(screen.getByText('preview line')).toBeInTheDocument());
  });
});

describe('TagsPage — rename and delete', () => {
  it('renames a tag via context menu and dialog', async () => {
    saveWorkspace('workspace_home', {
      ...loadWorkspace('workspace_home'),
      notes: [{ id: '1', text: '#oldslug\nbody', category: null }],
    });
    const user = userEvent.setup();
    renderFullApp(['/tags']);
    const row = await screen.findByRole('button', { name: /#oldslug/i });
    fireEvent.contextMenu(row, { clientX: 40, clientY: 40, bubbles: true, preventDefault: vi.fn() });
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Rename tag' })).toBeInTheDocument());
    const input = screen.getByPlaceholderText('tag_name');
    await user.clear(input);
    await user.type(input, 'newslug');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      const raw = loadWorkspace('workspace_home').notes?.[0]?.text ?? '';
      expect(raw.includes('#newslug')).toBe(true);
      expect(raw.includes('#oldslug')).toBe(false);
    });
  });

  it('removes a tag via context menu and mocked confirm', async () => {
    saveWorkspace('workspace_home', {
      ...loadWorkspace('workspace_home'),
      notes: [{ id: '1', text: '#todelete\nx', category: null }],
    });
    const user = userEvent.setup();
    renderFullApp(['/tags']);
    const row = await screen.findByRole('button', { name: /#todelete/i });
    fireEvent.contextMenu(row, { clientX: 40, clientY: 40, bubbles: true, preventDefault: vi.fn() });
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByTestId('mock-confirm-dialog')).toBeInTheDocument());
    await user.click(screen.getByTestId('mock-confirm-ok'));
    await waitFor(() => {
      expect(screen.queryByText('#todelete')).not.toBeInTheDocument();
      const raw = loadWorkspace('workspace_home').notes?.[0]?.text ?? '';
      expect(raw.includes('todelete')).toBe(false);
    });
  });
});
