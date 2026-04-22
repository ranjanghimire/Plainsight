/**
 * Tags: persistence in notes, tag-row keyboard, hashtag formatting, Tags page scope (visible vs hidden),
 * free (no remote sync) vs paid (Supabase note_tags).
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { SearchCommandBar } from '../src/components/SearchCommandBar';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  configurePaidUserTestMode,
  preparePaidRemoteWorkspaceRowsForKeys,
  seedFreshHomeWorkspace,
  seedHomePlusHiddenWorkspace,
  WorkspaceTestBridge,
} from './categoryTestHarness';
import { applyVitestPaidSyncFlags } from './hydration/entitlementLossTestUtils';
import * as syncEngine from '../src/sync/syncEngine';
import { getCanUseSupabase, setSyncEntitlementActive, setSyncRemoteActive } from '../src/sync/syncEnabled';
import { resetSyncQueueForTests } from '../src/sync/syncHelpers';
import { flushWorkspaceUiIntoLocalDb } from '../src/sync/workspaceStorageBridge';
import { composeNoteWithTags, parseNoteBodyAndTags } from '../src/utils/noteTags';
import {
  getOrCreateWorkspaceIdForStorageKey,
  loadWorkspace,
  saveWorkspace,
} from '../src/utils/storage';
import {
  deleteRemoteWorkspaceCascadeViaService,
  ensurePaidTestIdentity,
  getNoteTagsForWorkspace,
} from './supabaseTestHelpers';

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

const hasPaidEnv = Boolean(
  process.env.VITEST_SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    process.env.VITEST_SUPABASE_USER_ID?.trim() &&
    process.env.VITEST_SUPABASE_SESSION_TOKEN?.trim(),
);
const paidDescribe = hasPaidEnv ? describe : describe.skip;

beforeEach(() => {
  vi.restoreAllMocks();
  clearPlainsightStorage();
});

afterEach(() => {
  cleanup();
  resetSyncQueueForTests();
});

describe('tags in notes — persist locally', () => {
  beforeEach(() => {
    configureFreeUserTestMode();
    seedFreshHomeWorkspace();
  });

  it('keeps hashtag line on the note after unmount and remount', async () => {
    const user = userEvent.setup();
    const { unmount } = renderFullApp(['/']);
    const main = screen.getByRole('textbox', { name: 'New note' });
    await user.click(main);
    await user.type(main, 'Body under tags');
    const tagBox = screen.getByRole('textbox', { name: 'Tags' });
    await user.click(tagBox);
    await user.type(tagBox, 'persisttag');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => {
      const d = loadWorkspace('workspace_home');
      expect(d.notes?.some((n) => /persisttag/.test(String(n.text)))).toBe(true);
    });
    unmount();
    const user2 = userEvent.setup();
    renderFullApp(['/']);
    await waitFor(() => {
      expect(screen.getAllByText(/persisttag/i).length).toBeGreaterThanOrEqual(1);
    });
    const d = loadWorkspace('workspace_home');
    const note = d.notes?.find((n) => String(n.text).includes('persisttag'));
    expect(note).toBeTruthy();
    const parsed = parseNoteBodyAndTags(String(note!.text));
    expect(parsed.tags).toContain('persisttag');
    expect(parsed.body).toContain('Body under tags');
  });
});

describe('tag row — space inserts multi-tag delimiter', () => {
  beforeEach(() => {
    configureFreeUserTestMode();
    seedFreshHomeWorkspace();
  });

  it('inserts " #" after Space so a second tag can be typed (leading # is outside the input)', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <AuthProvider>
          <SyncEntitlementProvider>
            <WorkspaceProvider>
              <MemoryRouter initialEntries={['/']}>
                <SearchCommandBar value="" onChange={() => {}} onCreateNote={() => {}} />
              </MemoryRouter>
            </WorkspaceProvider>
          </SyncEntitlementProvider>
        </AuthProvider>
      </ThemeProvider>,
    );
    await user.click(screen.getByRole('textbox', { name: 'New note' }));
    const tagBox = screen.getByRole('textbox', { name: 'Tags' });
    await user.click(tagBox);
    await user.type(tagBox, 'alpha');
    fireEvent.keyDown(tagBox, { key: ' ', code: 'Space' });
    expect(tagBox).toHaveValue('alpha #');
  });
});

describe('hashtag line formatting', () => {
  it('composeNoteWithTags has no space between # and each slug', () => {
    const line = composeNoteWithTags(['foo', 'bar'], 'hello');
    const first = line.split('\n')[0];
    expect(first).toBe('#foo #bar');
    expect(first).toMatch(/^#[a-z0-9_]+(\s+#[a-z0-9_]+)*$/);
    expect(first).not.toMatch(/#\s/);
  });
});

describe('Tags page — visible vs hidden scope', () => {
  beforeEach(() => {
    configureFreeUserTestMode();
  });

  it('lists only visible-workspace tags on Home; hidden tags stay off the list', async () => {
    seedFreshHomeWorkspace();
    const { hiddenKey, switchName } = seedHomePlusHiddenWorkspace('hidscope');
    saveWorkspace('workspace_home', {
      ...loadWorkspace('workspace_home'),
      notes: [{ id: 'n1', text: '#vis_only_tag\nhome body', category: null }],
    });
    saveWorkspace(hiddenKey, {
      ...loadWorkspace(hiddenKey),
      notes: [{ id: 'n2', text: '#hid_only_tag\nhidden body', category: null }],
    });
    const user = userEvent.setup();
    renderFullApp(['/']);
    await user.click(screen.getByRole('button', { name: 'Tags' }));
    await waitFor(() => {
      expect(screen.getByText('Showing visible workspace tags')).toBeInTheDocument();
    });
    expect(screen.getByText('#vis_only_tag')).toBeInTheDocument();
    expect(screen.queryByText('#hid_only_tag')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '← Back' }));
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'New note' })).toBeInTheDocument();
    });

    const main = screen.getByRole('textbox', { name: 'New note' });
    await user.click(main);
    await user.type(main, `. ${switchName}`);
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await new Promise((r) => setTimeout(r, 500));
    await user.click(screen.getByRole('button', { name: 'Tags' }));
    await waitFor(() => {
      expect(screen.getByText('Showing hidden workspace tags')).toBeInTheDocument();
    });
    expect(screen.getByText('#hid_only_tag')).toBeInTheDocument();
    expect(screen.queryByText('#vis_only_tag')).not.toBeInTheDocument();
  });
});

describe('tags — free user does not run fullSync', () => {
  beforeEach(() => {
    configureFreeUserTestMode();
    seedFreshHomeWorkspace();
  });

  it('addNote with tags does not invoke fullSync while Supabase is gated off', async () => {
    const spy = vi.spyOn(syncEngine, 'fullSync');
    const user = userEvent.setup();
    renderFullApp(['/']);
    expect(getCanUseSupabase()).toBe(false);
    const main = screen.getByRole('textbox', { name: 'New note' });
    await user.click(main);
    await user.type(main, 'free tag body');
    await user.click(screen.getByRole('textbox', { name: 'Tags' }));
    await user.type(screen.getByRole('textbox', { name: 'Tags' }), 'freetag');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => {
      expect(loadWorkspace('workspace_home').notes?.length).toBeGreaterThan(0);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

paidDescribe('tags — paid user syncs note_tags to Supabase', () => {
  beforeEach(async () => {
    clearPlainsightStorage();
    configurePaidUserTestMode();
    applyVitestPaidSyncFlags(true);
    await ensurePaidTestIdentity();
    await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home']);
    seedFreshHomeWorkspace();
    await act(async () => {
      setSyncEntitlementActive(true);
      setSyncRemoteActive(true);
    });
  });

  afterEach(async () => {
    const wid = getOrCreateWorkspaceIdForStorageKey('workspace_home');
    await deleteRemoteWorkspaceCascadeViaService(wid);
    resetSyncQueueForTests();
    vi.restoreAllMocks();
  });

  it('flush + fullSync leaves note_tags rows for hashtags on the note', async () => {
    const wid = getOrCreateWorkspaceIdForStorageKey('workspace_home');
    saveWorkspace('workspace_home', {
      ...loadWorkspace('workspace_home'),
      notes: [
        {
          id: crypto.randomUUID(),
          text: '#syncpaidtag\npaid tag body',
          category: null,
        },
      ],
    });
    await flushWorkspaceUiIntoLocalDb(wid);
    const r = await syncEngine.fullSync([wid]);
    expect(r.ok).toBe(true);
    await waitFor(
      async () => {
        const rows = await getNoteTagsForWorkspace(wid);
        expect(rows.some((x) => x.tag === 'syncpaidtag')).toBe(true);
      },
      { timeout: 30_000 },
    );
  });
});
