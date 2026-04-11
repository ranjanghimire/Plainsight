/**
 * Regression: Tags route and archive mode must not leave both header toggles looking "pressed".
 * From Tags, Archive returns to the prior route and enables archive; from Archive, Tags exits archive then opens Tags.
 */

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
} from './categoryTestHarness';
import { resetSyncQueueForTests } from '../src/sync/syncHelpers';

function renderApp(initialEntries: string[] = ['/']) {
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

function tagsHeaderButton() {
  return screen.queryByRole('button', { name: 'Exit tags' }) ?? screen.getByRole('button', { name: 'Tags' });
}

function archiveHeaderButton() {
  return (
    screen.queryByRole('button', { name: 'Exit archive' }) ??
    screen.getByRole('button', { name: 'Archive and history' })
  );
}

/** Regression: both toggles must never appear active at once (Tags route + archiveMode bug). */
function expectNotBothTogglesPressed() {
  const tagsOn = tagsHeaderButton().getAttribute('aria-pressed') === 'true';
  const archiveOn = archiveHeaderButton().getAttribute('aria-pressed') === 'true';
  expect(tagsOn && archiveOn).toBe(false);
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

describe('Tags ↔ Archive header toggles', () => {
  it('from Tags, Archive navigates to notes and shows only archive as pressed', async () => {
    const user = userEvent.setup();
    renderApp(['/tags']);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /^tags$/i })).toBeInTheDocument();
    });

    const tagsBtn = tagsHeaderButton();
    const archiveBtn = archiveHeaderButton();
    expect(tagsBtn).toHaveAttribute('aria-pressed', 'true');
    expect(archiveBtn).toHaveAttribute('aria-pressed', 'false');
    expectNotBothTogglesPressed();

    await user.click(archiveBtn);

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { level: 1, name: /^archive$/i })).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    const tagsAfter = tagsHeaderButton();
    const archiveAfter = archiveHeaderButton();
    expect(tagsAfter).toHaveAttribute('aria-pressed', 'false');
    expect(archiveAfter).toHaveAttribute('aria-pressed', 'true');
    expectNotBothTogglesPressed();
  });

  it('from Archive on home, Tags opens Tags and shows only tags as pressed', async () => {
    const user = userEvent.setup();
    renderApp(['/']);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /plainsight/i })).toBeInTheDocument();
    });

    await user.click(archiveHeaderButton());

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /^archive$/i })).toBeInTheDocument();
    });
    expect(tagsHeaderButton()).toHaveAttribute('aria-pressed', 'false');
    expect(archiveHeaderButton()).toHaveAttribute('aria-pressed', 'true');

    await user.click(tagsHeaderButton());

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { level: 1, name: /^tags$/i })).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    expect(tagsHeaderButton()).toHaveAttribute('aria-pressed', 'true');
    expect(archiveHeaderButton()).toHaveAttribute('aria-pressed', 'false');
    expectNotBothTogglesPressed();
  });
});
