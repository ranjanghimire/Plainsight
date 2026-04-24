import { describe, expect, it, beforeEach } from 'vitest';
import { clearTagJumpIntent, peekTagJumpIntent, writeTagJumpIntent } from '../src/utils/tagJumpIntent';

describe('tagJumpIntent', () => {
  beforeEach(() => {
    clearTagJumpIntent();
  });

  it('round-trips storageKey and noteId', () => {
    writeTagJumpIntent({ storageKey: 'workspace_home', noteId: 'abc-123' });
    expect(peekTagJumpIntent()).toEqual({ storageKey: 'workspace_home', noteId: 'abc-123' });
    clearTagJumpIntent();
    expect(peekTagJumpIntent()).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    sessionStorage.setItem('plainsight:tag-jump-intent', '{');
    expect(peekTagJumpIntent()).toBeNull();
    clearTagJumpIntent();
  });
});
