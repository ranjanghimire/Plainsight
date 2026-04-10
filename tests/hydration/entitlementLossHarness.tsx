/**
 * Shell for entitlement-loss mid-session tests: probes for gating, sync queue, hydration, and workspace switching.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { ArchiveModeProvider } from '../../src/context/ArchiveModeContext';
import { SyncEntitlementProvider } from '../../src/context/SyncEntitlementContext';
import { TagsNavProvider } from '../../src/context/TagsNavContext';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { WorkspaceProvider, useWorkspace } from '../../src/context/WorkspaceContext';
import { HomePage } from '../../src/pages/HomePage';
import {
  getCanUseSupabase,
  getSyncEntitled,
  getSyncRemoteActive,
} from '../../src/sync/syncEnabled';
import { getSyncQueueStateForTests } from '../../src/sync/syncHelpers';
import { useSyncEntitlement } from '../../src/context/SyncEntitlementContext';
import { WorkspaceTestBridge } from '../categoryTestHarness';
import { HydrationProbe, NoteCountProbe, waitForHydrationCompleteAttr } from './hydrationHarness';

export { waitForHydrationCompleteAttr } from './hydrationHarness';

export function EntitlementLossProbe() {
  const { syncEntitled } = useSyncEntitlement();
  const { hydrationComplete, visibleWorkspaces } = useWorkspace();
  const q = getSyncQueueStateForTests();
  const can = getCanUseSupabase();
  const entitled = getSyncEntitled();
  const remote = getSyncRemoteActive();
  return (
    <div
      data-testid="entitlement-loss-probe"
      data-can-use-supabase={String(can)}
      data-sync-entitled={String(entitled)}
      data-sync-remote-active={String(remote)}
      data-rc-context-sync-entitled={String(syncEntitled)}
      data-hydration-complete={String(hydrationComplete)}
      data-visible-count={String(visibleWorkspaces.length)}
      data-sync-queue-pending={String(q.pending)}
      data-sync-in-flight={String(q.inFlight)}
      data-sync-debounce-scheduled={String(q.debounceScheduled)}
    />
  );
}

export function renderEntitlementLossHome() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SyncEntitlementProvider>
          <WorkspaceProvider>
            <MemoryRouter initialEntries={['/']}>
              <ArchiveModeProvider>
                <TagsNavProvider>
                  <HydrationProbe />
                  <EntitlementLossProbe />
                  <NoteCountProbe />
                  <WorkspaceTestBridge />
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
