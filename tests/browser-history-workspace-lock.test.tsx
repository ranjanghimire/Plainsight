/**
 * BackNavigationLock (App.jsx): popstate (browser back / forward) must not restore
 * workspace routes or reveal a hidden workspace after the user returned to a visible one.
 */

import React from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
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
  seedHomePlusHiddenWorkspace,
  WorkspaceTestBridge,
} from './categoryTestHarness';
import { resetSyncQueueForTests } from '../src/sync/syncHelpers';

function renderBrowserApp() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SyncEntitlementProvider>
          <WorkspaceProvider>
            <BrowserRouter>
              <ArchiveModeProvider>
                <TagsNavProvider>
                  <WorkspaceTestBridge />
                  <AppRoutes />
                </TagsNavProvider>
              </ArchiveModeProvider>
            </BrowserRouter>
          </WorkspaceProvider>
        </SyncEntitlementProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearPlainsightStorage();
});

afterEach(() => {
  cleanup();
  resetSyncQueueForTests();
});

async function openMenuAndPickHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open menu' }));
  const menu = await screen.findByTestId('menu-panel');
  await user.click(within(menu).getByRole('button', { name: 'Home' }));
  await waitFor(() => {
    expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
  });
}

describe('BackNavigationLock — browser history cannot surface workspaces', () => {
  beforeEach(() => {
    configureFreeUserTestMode();
  });

  it('after hidden workspace then Home via menu, browser back does not reveal the hidden workspace', async () => {
    const slug = 'bhlock';
    seedFreshHomeWorkspace();
    seedHomePlusHiddenWorkspace(slug);
    const user = userEvent.setup();
    renderBrowserApp();

    const main = await screen.findByRole('textbox', { name: 'New note' });
    await user.click(main);
    await user.type(main, `. ${slug}`);
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: new RegExp(`^${slug}$`, 'i') })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe(`/w/${slug}`);

    await openMenuAndPickHome(user);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /plainsight/i })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/');

    await act(async () => {
      window.history.back();
    });

    await waitFor(
      () => {
        expect(window.location.pathname).toBe('/');
        expect(screen.getByRole('heading', { level: 1, name: /plainsight/i })).toBeInTheDocument();
        expect(
          screen.queryByRole('heading', { level: 1, name: new RegExp(`^${slug}$`, 'i') }),
        ).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('browser back from Tags leaves the app on Home (/) rather than restoring /tags', async () => {
    seedFreshHomeWorkspace();
    const user = userEvent.setup();
    renderBrowserApp();

    await screen.findByRole('heading', { level: 1, name: /plainsight/i });

    await user.click(screen.getByRole('button', { name: 'Tags' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /^tags$/i })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/tags');

    await user.click(screen.getByRole('button', { name: 'Exit tags' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /plainsight/i })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/');

    await act(async () => {
      window.history.back();
    });

    await waitFor(
      () => {
        expect(window.location.pathname).toBe('/');
        expect(screen.getByRole('heading', { level: 1, name: /plainsight/i })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { level: 1, name: /^tags$/i })).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('browser forward does not restore Tags after back was neutralized', async () => {
    seedFreshHomeWorkspace();
    const user = userEvent.setup();
    renderBrowserApp();

    await screen.findByRole('heading', { level: 1, name: /plainsight/i });

    await user.click(screen.getByRole('button', { name: 'Tags' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /^tags$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Exit tags' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /plainsight/i })).toBeInTheDocument();
    });

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /plainsight/i })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/');
    });

    await act(async () => {
      window.history.forward();
    });

    await waitFor(
      () => {
        expect(screen.queryByRole('heading', { level: 1, name: /^tags$/i })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: /plainsight/i })).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
