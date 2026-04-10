/**
 * Right-edge swipe opens the menu drawer on every main shell; backdrop tap or swipe right closes it.
 * Touch simulation uses TouchEvent + touch-like objects (jsdom has no Touch constructor).
 */

import { screen, waitFor, act, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../src/App.jsx';
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
  seedHomePlusVisibleWorkspace,
  switchToVisibleWorkspaceEntry,
  workspaceTestHandlesRef,
  WorkspaceTestBridge,
} from './categoryTestHarness';

const VIEWPORT_W = 800;

let innerWidthDescriptor: PropertyDescriptor | undefined;

function touchLike(clientX: number, clientY: number, target: EventTarget = document.documentElement) {
  return { clientX, clientY, target };
}

function dispatchTouch(
  type: 'touchstart' | 'touchmove' | 'touchend',
  touches: { clientX: number; clientY: number }[],
  changed: { clientX: number; clientY: number }[],
) {
  const target = document.documentElement;
  const tList = touches.map((p) => touchLike(p.clientX, p.clientY, target));
  const cList = changed.map((p) => touchLike(p.clientX, p.clientY, target));
  const ev = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : tList,
    targetTouches: type === 'touchend' ? [] : tList,
    changedTouches: cList,
  });
  act(() => {
    target.dispatchEvent(ev);
  });
}

/** Start at right edge, end left enough to pass THRESHOLD (30) with horizontal dominance. */
function swipeOpenMenuFromRightEdge() {
  const w = window.innerWidth;
  const y = 120;
  const startX = w - 8;
  const endX = w - 50;
  dispatchTouch('touchstart', [{ clientX: startX, clientY: y }], [{ clientX: startX, clientY: y }]);
  dispatchTouch('touchmove', [{ clientX: endX, clientY: y }], [{ clientX: endX, clientY: y }]);
  dispatchTouch('touchend', [], [{ clientX: endX, clientY: y }]);
}

/** When menu is open, swipe right (start left, end right) to close. */
function swipeCloseMenuToRight() {
  const y = 200;
  const startX = 120;
  const endX = 220;
  dispatchTouch('touchstart', [{ clientX: startX, clientY: y }], [{ clientX: startX, clientY: y }]);
  dispatchTouch('touchmove', [{ clientX: endX, clientY: y }], [{ clientX: endX, clientY: y }]);
  dispatchTouch('touchend', [], [{ clientX: endX, clientY: y }]);
}

function renderAppShell() {
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

async function waitForHomeShell() {
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: 'Plainsight' })).toBeVisible();
  });
}

describe('drawer — right-edge swipe and dismiss', () => {
  beforeEach(() => {
    innerWidthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: VIEWPORT_W,
    });
    clearPlainsightStorage();
    configureFreeUserTestMode();
    seedFreshHomeWorkspace();
  });

  afterEach(() => {
    if (innerWidthDescriptor) {
      Object.defineProperty(window, 'innerWidth', innerWidthDescriptor);
    } else {
      Reflect.deleteProperty(window, 'innerWidth');
    }
  });

  it('home: swipe from right opens menu; backdrop and swipe right close', async () => {
    const user = userEvent.setup();
    renderAppShell();
    await waitForHomeShell();

    swipeOpenMenuFromRightEdge();
    await waitFor(() => {
      expect(screen.getByTestId('menu-panel')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('menu-panel-backdrop'));
    await waitFor(() => {
      expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
    });

    swipeOpenMenuFromRightEdge();
    await waitFor(() => {
      expect(screen.getByTestId('menu-panel')).toBeInTheDocument();
    });

    swipeCloseMenuToRight();
    await waitFor(() => {
      expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
    });
  });

  it('visible workspace tab: swipe opens menu; backdrop closes', async () => {
    const user = userEvent.setup();
    const { entry } = seedHomePlusVisibleWorkspace('DrawerVis');
    renderAppShell();
    await waitForHomeShell();
    await waitFor(() => expect(workspaceTestHandlesRef.current).toBeTruthy());
    await act(async () => {
      await switchToVisibleWorkspaceEntry(entry);
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'DrawerVis' })).toBeVisible();
    });

    swipeOpenMenuFromRightEdge();
    await waitFor(() => {
      expect(screen.getByTestId('menu-panel')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('menu-panel-backdrop'));
    await waitFor(() => {
      expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
    });
  });

  it('hidden workspace: swipe opens menu; swipe right closes', async () => {
    seedHomePlusHiddenWorkspace('drawersw');
    const user = userEvent.setup();
    renderAppShell();
    await waitForHomeShell();

    const noteBox = screen.getByRole('textbox', { name: 'New note' });
    await user.click(noteBox);
    await user.type(noteBox, '.drawersw');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Drawersw' })).toBeVisible();
    });

    swipeOpenMenuFromRightEdge();
    await waitFor(() => {
      expect(screen.getByTestId('menu-panel')).toBeInTheDocument();
    });

    swipeCloseMenuToRight();
    await waitFor(() => {
      expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
    });
  });

  it('archive mode: swipe opens menu; backdrop closes', async () => {
    const user = userEvent.setup();
    renderAppShell();
    await waitForHomeShell();

    await user.click(screen.getByRole('button', { name: 'Archive and history' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Archive' })).toBeVisible();
    });

    swipeOpenMenuFromRightEdge();
    await waitFor(() => {
      expect(screen.getByTestId('menu-panel')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('menu-panel-backdrop'));
    await waitFor(() => {
      expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
    });
  });

  it('tags page: swipe opens menu; swipe right closes', async () => {
    const user = userEvent.setup();
    renderAppShell();
    await waitForHomeShell();

    await user.click(screen.getByRole('button', { name: 'Tags' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Tags' })).toBeVisible();
    });

    swipeOpenMenuFromRightEdge();
    await waitFor(() => {
      expect(screen.getByTestId('menu-panel')).toBeInTheDocument();
    });

    swipeCloseMenuToRight();
    await waitFor(() => {
      expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
    });
  });
});
