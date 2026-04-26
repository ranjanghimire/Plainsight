import { describe, expect, it } from 'vitest';
import { normalizeLastActiveStorageKeyAfterSync, VISIBLE_WS_PREFIX } from '../src/utils/storage';

const SHARED_WID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
const SHARED_KEY = `${VISIBLE_WS_PREFIX}${SHARED_WID}`;

describe('normalizeLastActiveStorageKeyAfterSync', () => {
  it('maps shared ws_visible_* to Home when that key is not in the personal visible list', () => {
    const nextVisible = [{ id: 'home', name: 'Home', key: 'workspace_home' }];
    const out = normalizeLastActiveStorageKeyAfterSync({
      lastActiveStorageKey: SHARED_KEY,
      nextVisibleWorkspaces: nextVisible,
      mergedWorkspaceIds: new Set([SHARED_WID]),
      mergedStorageKeys: new Set(['workspace_home', SHARED_KEY]),
    });
    expect(out).toBe('workspace_home');
  });

  it('keeps ws_visible_* when it appears in visibleWorkspaces (personal tab)', () => {
    const nextVisible = [
      { id: 'home', name: 'Home', key: 'workspace_home' },
      { id: SHARED_WID, name: 'My tab', key: SHARED_KEY },
    ];
    const out = normalizeLastActiveStorageKeyAfterSync({
      lastActiveStorageKey: SHARED_KEY,
      nextVisibleWorkspaces: nextVisible,
      mergedWorkspaceIds: new Set([SHARED_WID]),
      mergedStorageKeys: new Set(['workspace_home', SHARED_KEY]),
    });
    expect(out).toBe(SHARED_KEY);
  });

  it('maps ws_visible_* to Home when workspace id is no longer merged', () => {
    const out = normalizeLastActiveStorageKeyAfterSync({
      lastActiveStorageKey: SHARED_KEY,
      nextVisibleWorkspaces: [{ id: 'home', name: 'Home', key: 'workspace_home' }],
      mergedWorkspaceIds: new Set(),
      mergedStorageKeys: new Set(['workspace_home']),
    });
    expect(out).toBe('workspace_home');
  });

  it('maps orphan legacy hidden keys to Home', () => {
    const out = normalizeLastActiveStorageKeyAfterSync({
      lastActiveStorageKey: 'workspace_orphan',
      nextVisibleWorkspaces: [{ id: 'home', name: 'Home', key: 'workspace_home' }],
      mergedWorkspaceIds: new Set(),
      mergedStorageKeys: new Set(['workspace_home']),
    });
    expect(out).toBe('workspace_home');
  });

  it('leaves workspace_home unchanged', () => {
    expect(
      normalizeLastActiveStorageKeyAfterSync({
        lastActiveStorageKey: 'workspace_home',
        nextVisibleWorkspaces: [{ id: 'home', name: 'Home', key: 'workspace_home' }],
        mergedWorkspaceIds: new Set(),
        mergedStorageKeys: new Set(['workspace_home']),
      }),
    ).toBe('workspace_home');
  });
});
