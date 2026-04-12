/**
 * Horizontal swipe on the notes workspace cycles categories (same order as chips).
 * Right-edge strip stays reserved for the menu drawer (see drawer-swipe-menu tests).
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from '../src/App.jsx';
import { MENU_RIGHT_EDGE_SWIPE_PX } from '../src/constants/menuEdgeSwipe';
import { AuthProvider } from '../src/context/AuthContext';
import { ArchiveModeProvider } from '../src/context/ArchiveModeContext';
import { SyncEntitlementProvider } from '../src/context/SyncEntitlementContext';
import { TagsNavProvider } from '../src/context/TagsNavContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  renderHomePage,
  seedFreshHomeWorkspace,
  waitForCategoryRowReady,
  WorkspaceTestBridge,
} from './categoryTestHarness';
import { getDefaultWorkspaceData, saveWorkspace } from '../src/utils/storage';

const VIEWPORT_W = 720;

let innerWidthDescriptor: PropertyDescriptor | undefined;

function touchLike(clientX: number, clientY: number, target: EventTarget) {
  return { clientX, clientY, target };
}

function dispatchTouchOn(
  el: Element,
  type: 'touchstart' | 'touchmove' | 'touchend',
  touches: { clientX: number; clientY: number }[],
  changed: { clientX: number; clientY: number }[],
) {
  const tList = touches.map((p) => touchLike(p.clientX, p.clientY, el));
  const cList = changed.map((p) => touchLike(p.clientX, p.clientY, el));
  const ev = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : tList,
    targetTouches: type === 'touchend' ? [] : tList,
    changedTouches: cList,
  });
  act(() => {
    el.dispatchEvent(ev);
  });
}

/** Finger moves left (negative dx) → next category. */
function swipeNextCategoryOn(el: Element) {
  const y = 340;
  const startX = 360;
  const endX = 260;
  dispatchTouchOn(el, 'touchstart', [{ clientX: startX, clientY: y }], [{ clientX: startX, clientY: y }]);
  dispatchTouchOn(el, 'touchmove', [{ clientX: endX, clientY: y }], [{ clientX: endX, clientY: y }]);
  dispatchTouchOn(el, 'touchend', [], [{ clientX: endX, clientY: y }]);
}

/** Finger moves right (positive dx) → previous category. */
function swipePrevCategoryOn(el: Element) {
  const y = 340;
  const startX = 360;
  const endX = 460;
  dispatchTouchOn(el, 'touchstart', [{ clientX: startX, clientY: y }], [{ clientX: startX, clientY: y }]);
  dispatchTouchOn(el, 'touchmove', [{ clientX: endX, clientY: y }], [{ clientX: endX, clientY: y }]);
  dispatchTouchOn(el, 'touchend', [], [{ clientX: endX, clientY: y }]);
}

function expectChipLooksSelected(testId: string) {
  const el = screen.getByTestId(testId);
  expect(el.className).toContain('bg-stone-300');
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

function swipeOpenMenuFromRightEdge() {
  const w = window.innerWidth;
  const y = 200;
  const startX = w - 8;
  const endX = w - 50;
  const target = document.documentElement;
  const tList = [touchLike(startX, y, target)];
  const cEnd = [touchLike(endX, y, target)];
  act(() => {
    target.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: tList,
        targetTouches: tList,
        changedTouches: tList,
      }),
    );
    target.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: cEnd,
        targetTouches: cEnd,
        changedTouches: cEnd,
      }),
    );
    target.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: cEnd,
      }),
    );
  });
}

describe('category swipe navigation', () => {
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
    const base = getDefaultWorkspaceData();
    saveWorkspace('workspace_home', {
      ...base,
      categories: ['SwipeCatA', 'SwipeCatB'],
    });
  });

  afterEach(() => {
    if (innerWidthDescriptor) {
      Object.defineProperty(window, 'innerWidth', innerWidthDescriptor);
    } else {
      Reflect.deleteProperty(window, 'innerWidth');
    }
  });

  it('swipe left on workspace advances from All to the first named category', async () => {
    renderHomePage();
    await waitForCategoryRowReady();

    expectChipLooksSelected('category-chip--all');

    const area = screen.getByTestId('notes-workspace-swipe-area');
    swipeNextCategoryOn(area);

    await waitFor(() => {
      expectChipLooksSelected('category-chip--swipecata');
    });
  });

  it('swipe right returns to the previous category in chip order', async () => {
    renderHomePage();
    await waitForCategoryRowReady();

    const area = screen.getByTestId('notes-workspace-swipe-area');
    swipeNextCategoryOn(area);
    await waitFor(() => {
      expectChipLooksSelected('category-chip--swipecata');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });

    swipePrevCategoryOn(area);
    await waitFor(() => {
      expectChipLooksSelected('category-chip--all');
    });
  });

  it('swipe starting in the menu edge strip does not change category (strip reserved for drawer)', async () => {
    renderHomePage();
    await waitForCategoryRowReady();

    expectChipLooksSelected('category-chip--all');
    const area = screen.getByTestId('notes-workspace-swipe-area');
    const y = 300;
    const startX = VIEWPORT_W - MENU_RIGHT_EDGE_SWIPE_PX + 2;
    const endX = VIEWPORT_W - 80;
    dispatchTouchOn(area, 'touchstart', [{ clientX: startX, clientY: y }], [{ clientX: startX, clientY: y }]);
    dispatchTouchOn(area, 'touchmove', [{ clientX: endX, clientY: y }], [{ clientX: endX, clientY: y }]);
    dispatchTouchOn(area, 'touchend', [], [{ clientX: endX, clientY: y }]);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expectChipLooksSelected('category-chip--all');
  });

  it('full app: document right-edge swipe still opens menu; category stays on All', async () => {
    renderAppShell();
    await waitForHomeShell();

    await waitFor(() => {
      expect(screen.getByTestId('notes-workspace-swipe-area')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('category-chip--swipecata')).toBeInTheDocument();
    });

    expectChipLooksSelected('category-chip--all');

    swipeOpenMenuFromRightEdge();
    await waitFor(() => {
      expect(screen.getByTestId('menu-panel')).toBeInTheDocument();
    });

    expectChipLooksSelected('category-chip--all');
  });
});
