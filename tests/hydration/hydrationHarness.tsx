/**
 * Shared shell for hydration tests: real WorkspaceProvider + HomePage (runs runInitialHydration when paid).
 * Entitlement-loss mid-session: see `entitlementLossHarness.tsx` + `entitlement-loss-mid-session.test.tsx`.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/** Default cap for `waitForHydrationCompleteAttr` so hydration cannot hang indefinitely. */
export const HYDRATION_COMPLETE_DEFAULT_TIMEOUT_MS = 90_000;

export { createHydrationTestWorkspaceId } from './hydrationTestIds';
import { AuthProvider } from '../../src/context/AuthContext';
import { ArchiveModeProvider } from '../../src/context/ArchiveModeContext';
import { TagsNavProvider } from '../../src/context/TagsNavContext';
import { SyncEntitlementProvider } from '../../src/context/SyncEntitlementContext';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { WorkspaceProvider, useWorkspace } from '../../src/context/WorkspaceContext';
import { HomePage } from '../../src/pages/HomePage';

export function HydrationProbe() {
  const { visibleWorkspaces, activeStorageKey, hydrationComplete } = useWorkspace();
  return (
    <div
      data-testid="hydration-probe"
      data-active-key={activeStorageKey}
      data-visible-count={String(visibleWorkspaces.length)}
      data-hydration-complete={String(hydrationComplete)}
      data-visible-names={visibleWorkspaces.map((w) => w.name).join('|')}
    />
  );
}

export function NoteCountProbe() {
  const { data } = useWorkspace();
  const n = (data?.notes || []).length;
  return <div data-testid="note-count-probe" data-note-count={String(n)} />;
}

export function renderHydrationHome() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SyncEntitlementProvider>
          <WorkspaceProvider>
            <MemoryRouter initialEntries={['/']}>
              <ArchiveModeProvider>
                <TagsNavProvider>
                  <HydrationProbe />
                  <NoteCountProbe />
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                  </Routes>
                </TagsNavProvider>
              </ArchiveModeProvider>
            </MemoryRouter>
          </WorkspaceProvider>
        </SyncEntitlementProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

export type WaitForHydrationCompleteOptions = {
  /** @default HYDRATION_COMPLETE_DEFAULT_TIMEOUT_MS */
  timeoutMs?: number;
};

export async function waitForHydrationCompleteAttr(
  options?: WaitForHydrationCompleteOptions,
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? HYDRATION_COMPLETE_DEFAULT_TIMEOUT_MS;
  try {
    await waitFor(
      () => {
        const el = document.querySelector('[data-testid="hydration-probe"]');
        expect(el?.getAttribute('data-hydration-complete')).toBe('true');
      },
      { timeout: timeoutMs },
    );
  } catch (e) {
    const probe = document.querySelector('[data-testid="hydration-probe"]');
    const state = probe?.getAttribute('data-hydration-complete') ?? '(probe missing)';
    throw new Error(
      `Hydration did not complete within ${timeoutMs}ms (expected data-hydration-complete="true", got "${state}"). ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
