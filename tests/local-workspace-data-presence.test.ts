import { afterEach, describe, expect, it } from 'vitest';
import { localWorkspaceHasMeaningfulData } from '../src/utils/localWorkspaceDataPresence';
import { saveWorkspace } from '../src/utils/storage';

describe('localWorkspaceHasMeaningfulData', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('is false for empty default-shaped workspace', () => {
    saveWorkspace('workspace_home', { notes: [], categories: [], archivedNotes: {} });
    expect(localWorkspaceHasMeaningfulData()).toBe(false);
  });

  it('is true when a workspace has notes', () => {
    saveWorkspace('workspace_home', {
      notes: [{ id: 'n1', text: 'hi', category: null }],
      categories: [],
      archivedNotes: {},
    });
    expect(localWorkspaceHasMeaningfulData()).toBe(true);
  });

  it('is true when a workspace has categories', () => {
    saveWorkspace('workspace_home', {
      notes: [],
      categories: [{ id: 'c1', name: 'Work' }],
      archivedNotes: {},
    });
    expect(localWorkspaceHasMeaningfulData()).toBe(true);
  });

  it('is true when a workspace has archived entries', () => {
    saveWorkspace('workspace_home', {
      notes: [],
      categories: [],
      archivedNotes: { x: { text: 'x', lastDeletedAt: 1 } },
    });
    expect(localWorkspaceHasMeaningfulData()).toBe(true);
  });
});
