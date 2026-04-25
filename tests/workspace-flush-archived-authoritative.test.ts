import { describe, expect, it } from 'vitest';
import { shouldAuthoritativeClearArchivedOnFlush } from '../src/sync/workspaceStorageBridge';

describe('shouldAuthoritativeClearArchivedOnFlush', () => {
  it('is false when we have never seen non-empty remote archived for this workspace', () => {
    expect(shouldAuthoritativeClearArchivedOnFlush(false, new Set())).toBe(false);
    expect(shouldAuthoritativeClearArchivedOnFlush(false, new Set(['a']))).toBe(false);
  });

  it('is false when remote pull is absent (flush opts not passed)', () => {
    expect(shouldAuthoritativeClearArchivedOnFlush(true, undefined)).toBe(false);
    expect(shouldAuthoritativeClearArchivedOnFlush(true, null)).toBe(false);
  });

  it('is true when we had remote archived before and the current pull is empty', () => {
    expect(shouldAuthoritativeClearArchivedOnFlush(true, new Set())).toBe(true);
  });

  it('is false when the current pull still has rows', () => {
    expect(shouldAuthoritativeClearArchivedOnFlush(true, new Set(['id-1']))).toBe(false);
  });
});
