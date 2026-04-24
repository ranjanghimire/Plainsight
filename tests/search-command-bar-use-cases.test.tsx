import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  seedFreshHomeWorkspace,
  waitForCategoryRowReady,
} from './categoryTestHarness';
import { loadWorkspace } from '../src/utils/storage';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../src/App';
import { ThemeProvider } from '../src/context/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import { SyncEntitlementProvider } from '../src/context/SyncEntitlementContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';
import { ArchiveModeProvider } from '../src/context/ArchiveModeContext';
import { TagsNavProvider } from '../src/context/TagsNavContext';
import { WorkspaceTestBridge } from './categoryTestHarness';

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

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
});

describe('SearchCommandBar / composer use-cases', () => {
  it('clicking the search bar expands the text area', async () => {
    const user = userEvent.setup();
    renderFullApp();
    await waitForCategoryRowReady();

    const box = screen.getByRole('textbox', { name: 'New note' });
    expect(box).toHaveAttribute('rows', '1');

    await user.click(box);
    expect(box).toHaveAttribute('rows', '4');
  });

  it('pressing Enter in the composer inserts a new line (does not submit)', async () => {
    const user = userEvent.setup();
    renderFullApp();
    await waitForCategoryRowReady();

    const box = screen.getByRole('textbox', { name: 'New note' });
    await user.click(box);
    await user.type(box, 'hello{enter}world');

    expect((box as HTMLTextAreaElement).value).toBe('hello\nworld');
    expect(loadWorkspace('workspace_home').notes?.length ?? 0).toBe(0);
  });

  it('clicking the paper plane icon in the search bar submits the note', async () => {
    const user = userEvent.setup();
    renderFullApp();
    await waitForCategoryRowReady();

    const box = screen.getByRole('textbox', { name: 'New note' });
    await user.click(box);
    await user.type(box, 'paper-plane submit');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => {
      expect(screen.getAllByText('paper-plane submit').length).toBeGreaterThan(0);
      expect(loadWorkspace('workspace_home').notes?.length ?? 0).toBeGreaterThan(0);
    });
  });

  it('clicking the floating paper plane icon submits the note', async () => {
    const user = userEvent.setup();
    renderFullApp();
    await waitForCategoryRowReady();

    const box = screen.getByRole('textbox', { name: 'New note' });
    await user.click(box);
    await user.type(box, 'floating submit');

    const floating = await screen.findByRole('button', { name: 'Send note' });
    await user.click(floating);

    await waitFor(() => {
      expect(screen.getAllByText('floating submit').length).toBeGreaterThan(0);
      expect(loadWorkspace('workspace_home').notes?.length ?? 0).toBeGreaterThan(0);
    });
  });

  it('clicking the maximize button expands the note writing area', async () => {
    const user = userEvent.setup();
    renderFullApp();
    await waitForCategoryRowReady();

    const box = screen.getByRole('textbox', { name: 'New note' });
    await user.click(box);
    expect(box).toHaveAttribute('rows', '4');

    await user.click(screen.getByRole('button', { name: 'Taller note field' }));
    expect(box).toHaveAttribute('rows', '7');
    expect(screen.getByRole('button', { name: 'Use shorter note field' })).toBeInTheDocument();
  });

  it('clicking the tag row to type collapses the popover', async () => {
    const user = userEvent.setup();
    renderFullApp();
    await waitForCategoryRowReady();

    const box = screen.getByRole('textbox', { name: 'New note' });
    await user.click(box);

    // Popover starts expanded by default on SearchCommandBar.
    expect(
      screen.getByRole('button', { name: 'Collapse formatting options' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('textbox', { name: 'Tags' }));
    await sleep(0);

    expect(
      screen.queryByRole('button', { name: 'Collapse formatting options' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Show note formatting options' })).toBeInTheDocument();
  });
});

