/**
 * UI / product rules: workspaces (visible + hidden), theme, search bar, cold start on Home.
 */

import React, { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ArchiveModeProvider } from '../src/context/ArchiveModeContext';
import { SyncEntitlementProvider } from '../src/context/SyncEntitlementContext';
import { TagsNavProvider } from '../src/context/TagsNavContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';
import { SearchCommandBar } from '../src/components/SearchCommandBar';
import { MAX_FREE_VISIBLE_WORKSPACES } from '../src/constants/workspaceLimits';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  HOME_VISIBLE_ENTRY,
  seedFreshHomeWorkspace,
  seedHomePlusHiddenWorkspace,
  seedHomePlusVisibleWorkspace,
  workspaceTestHandlesRef,
  WorkspaceTestBridge,
} from './categoryTestHarness';
import {
  loadAppState,
  loadWorkspace,
  saveAppState,
  saveWorkspace,
  setWorkspaceIdMapping,
  VISIBLE_WS_PREFIX,
  getDefaultWorkspaceData,
} from '../src/utils/storage';
import { v4 as uuidv4 } from 'uuid';

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

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open menu' }));
  await waitFor(() => expect(screen.getByTestId('menu-panel')).toBeInTheDocument());
}

function seedMaxFreeVisibleTabs() {
  const list = [HOME_VISIBLE_ENTRY];
  for (let i = 0; i < MAX_FREE_VISIBLE_WORKSPACES - 1; i++) {
    const id = uuidv4();
    const key = `${VISIBLE_WS_PREFIX}${id}`;
    setWorkspaceIdMapping(key, id);
    saveWorkspace(key, getDefaultWorkspaceData());
    list.push({ id, name: `Tab${i + 1}`, key });
  }
  saveAppState(list, 'workspace_home');
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearPlainsightStorage();
  configureFreeUserTestMode();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cold start & routing', () => {
  it('opens on Home even when app state lastActive pointed at another visible tab', async () => {
    const { entry, visKey } = seedHomePlusVisibleWorkspace('OtherTab');
    saveAppState([HOME_VISIBLE_ENTRY, entry], visKey);
    renderFullApp(['/']);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Plainsight' })).toBeInTheDocument();
    });
    await waitFor(() => expect(workspaceTestHandlesRef.current?.activeStorageKey).toBe('workspace_home'));
  });

  it('replaces /w/unknown on first load with Home route', async () => {
    seedFreshHomeWorkspace();
    renderFullApp(['/w/not-a-real-workspace-slug']);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Plainsight' })).toBeInTheDocument();
    });
  });
});

describe('dark mode toggle', () => {
  it('applies dark class on document when Dark mode is on', async () => {
    seedFreshHomeWorkspace();
    const user = userEvent.setup();
    renderFullApp(['/']);
    await openMenu(user);
    const darkSwitch = screen.getByRole('switch', { name: /dark mode/i });
    expect(darkSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(darkSwitch);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
    expect(localStorage.getItem('plainsight-theme')).toBe('dark');
    expect(darkSwitch).toHaveAttribute('aria-checked', 'true');
    await user.click(darkSwitch);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
    expect(localStorage.getItem('plainsight-theme')).toBe('light');
  });
});

describe('free user visible workspace limit', () => {
  it('does not add a workspace at the cap and shows persistent upgrade toast', async () => {
    seedMaxFreeVisibleTabs();
    expect(loadAppState().visibleWorkspaces.length).toBe(MAX_FREE_VISIBLE_WORKSPACES);
    const user = userEvent.setup();
    renderFullApp(['/']);
    await openMenu(user);
    await user.click(await screen.findByText('+ New workspace'));
    const nameInput = screen.getByPlaceholderText('Workspace name');
    await user.type(nameInput, 'OverLimit');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Free plan allows/i);
    });
    expect(
      screen.getByRole('button', { name: /Unlock cloud sync|Sign in with email/ }),
    ).toBeInTheDocument();
    expect(loadAppState().visibleWorkspaces.length).toBe(MAX_FREE_VISIBLE_WORKSPACES);
  });
});

describe('create visible workspace', () => {
  it('creates a new storage key and visible entry from the menu', async () => {
    seedFreshHomeWorkspace();
    const user = userEvent.setup();
    renderFullApp(['/']);
    await openMenu(user);
    await user.click(screen.getByText('+ New workspace'));
    await user.type(screen.getByPlaceholderText('Workspace name'), 'GammaTab');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(loadAppState().visibleWorkspaces.some((e) => e.name === 'GammaTab')).toBe(true);
    });
    const entry = loadAppState().visibleWorkspaces.find((e) => e.name === 'GammaTab');
    expect(entry).toBeTruthy();
    expect(localStorage.getItem(entry!.key)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(entry!.key)!)).toEqual(
      expect.objectContaining({ notes: [], categories: [] }),
    );
  });
});

describe('visible workspace rename & delete (programmatic)', () => {
  it('rename updates visible workspace display name', async () => {
    const { entry } = seedHomePlusVisibleWorkspace('BetaTab');
    renderFullApp(['/']);
    await waitFor(() => expect(workspaceTestHandlesRef.current).toBeTruthy());
    await act(async () => {
      workspaceTestHandlesRef.current!.renameVisibleWorkspace(entry, 'RenamedTab');
    });
    await waitFor(() => {
      expect(loadAppState().visibleWorkspaces.find((e) => e.key === entry.key)?.name).toBe('RenamedTab');
    });
  });

  it('delete removes workspace blob, notes, and drops the tab from app state', async () => {
    const { entry, visKey } = seedHomePlusVisibleWorkspace('ToDelete');
    saveWorkspace(visKey, {
      ...getDefaultWorkspaceData(),
      notes: [{ id: 'n1', text: 'orphan', category: null }],
      categories: ['CatInDeletedWs'],
    });
    renderFullApp(['/']);
    await waitFor(() => expect(workspaceTestHandlesRef.current).toBeTruthy());
    await act(async () => {
      await workspaceTestHandlesRef.current!.deleteVisibleWorkspace(entry);
    });
    await waitFor(() => {
      expect(loadAppState().visibleWorkspaces.some((e) => e.key === visKey)).toBe(false);
    });
    expect(localStorage.getItem(visKey)).toBeNull();
    expect(workspaceTestHandlesRef.current?.activeStorageKey).toBe('workspace_home');
  });
});

describe('hidden workspace manage page', () => {
  it('rename changes legacy hidden storage key', async () => {
    const { hiddenKey } = seedHomePlusHiddenWorkspace('frog');
    expect(loadWorkspace(hiddenKey)).toBeTruthy();
    const user = userEvent.setup();
    renderFullApp(['/manage']);
    await screen.findByText('frog');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByDisplayValue('frog');
    await user.clear(input);
    await user.type(input, 'toad');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(localStorage.getItem('workspace_toad')).toBeTruthy();
    });
    expect(localStorage.getItem('workspace_frog')).toBeNull();
  });

  it('delete removes hidden workspace blob after confirm', async () => {
    const { hiddenKey } = seedHomePlusHiddenWorkspace('zap');
    vi.stubGlobal('confirm', vi.fn(() => true));
    const user = userEvent.setup();
    renderFullApp(['/manage']);
    await screen.findByText('zap');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(localStorage.getItem(hiddenKey)).toBeNull();
    });
    expect(globalThis.confirm).toHaveBeenCalled();
  });
});

describe('SearchCommandBar', () => {
  it('Enter creates a note from a single line', async () => {
    seedFreshHomeWorkspace();
    const user = userEvent.setup();
    renderFullApp(['/']);
    const box = screen.getByRole('textbox', { name: 'New note' });
    await user.type(box, 'Hello from test');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.getAllByText('Hello from test').length).toBeGreaterThanOrEqual(1);
    });
    expect(box).toHaveValue('');
  });

  it('Enter runs dot-command (go home) when input is a command', async () => {
    const { entry, visKey } = seedHomePlusVisibleWorkspace('CmdTab');
    saveAppState([HOME_VISIBLE_ENTRY, entry], visKey);
    const user = userEvent.setup();
    renderFullApp(['/']);
    await waitFor(() => expect(workspaceTestHandlesRef.current).toBeTruthy());
    await act(async () => {
      workspaceTestHandlesRef.current!.switchVisibleWorkspace(entry);
    });
    await new Promise((r) => setTimeout(r, 400));
    await waitFor(() => expect(workspaceTestHandlesRef.current?.activeStorageKey).toBe(visKey));
    const box = screen.getByRole('textbox', { name: 'New note' });
    await user.type(box, '.');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Plainsight' })).toBeInTheDocument();
    });
    expect(workspaceTestHandlesRef.current?.activeStorageKey).toBe('workspace_home');
  });

});

describe('SearchCommandBar keyboard (isolated)', () => {
  function Bar({ onCreate }: { onCreate: (s: string, opts?: { boldFirstLine?: boolean }) => void }) {
    const [v, setV] = useState('');
    return <SearchCommandBar value={v} onChange={setV} onCreateNote={onCreate} />;
  }

  function renderSearchBar(onCreate: (s: string, opts?: { boldFirstLine?: boolean }) => void = vi.fn()) {
    return render(
      <ThemeProvider>
        <AuthProvider>
          <SyncEntitlementProvider>
            <WorkspaceProvider>
              <MemoryRouter initialEntries={['/']}>
                <Routes>
                  <Route path="/" element={<Bar onCreate={onCreate} />} />
                </Routes>
              </MemoryRouter>
            </WorkspaceProvider>
          </SyncEntitlementProvider>
        </AuthProvider>
      </ThemeProvider>,
    );
  }

  it('Enter submits a single-line note and clears the field', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    renderSearchBar(onCreate);
    const box = screen.getByRole('textbox', { name: 'New note' });
    await user.type(box, 'Solo line');
    await user.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalledWith('Solo line', { boldFirstLine: false });
    expect(box).toHaveValue('');
  });

  it('Shift+Enter does not submit (onCreate stays unused)', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    renderSearchBar(onCreate);
    const box = screen.getByRole('textbox', { name: 'New note' });
    await user.type(box, 'partial');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onCreate).not.toHaveBeenCalled();
  });
});
