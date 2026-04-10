/**
 * Lightweight workspace row UUIDs for hydration tests (no React / providers).
 */

export function createHydrationTestWorkspaceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('createHydrationTestWorkspaceId: crypto.randomUUID is not available');
}
