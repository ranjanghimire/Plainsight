import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  readHomeCategories,
  renderHomePage,
  seedFreshHomeWorkspace,
  waitForCategoryRowReady,
} from './categoryTestHarness';

beforeEach(() => {
  vi.restoreAllMocks();
  clearPlainsightStorage();
  configureFreeUserTestMode();
  seedFreshHomeWorkspace();
});

afterEach(() => {
  cleanup();
});

describe('Category pills — rename via right-click (context menu)', () => {
  it('renames a category from the chip context menu', async () => {
    const user = userEvent.setup();
    renderHomePage();
    await waitForCategoryRowReady();

    await user.click(screen.getByTestId('category-chip--add'));
    await user.type(screen.getByTestId('category-inline-name-input'), 'OldCat');
    await user.click(screen.getByTestId('category-inline-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('category-chip--oldcat')).toBeInTheDocument();
      expect(readHomeCategories()).toContain('OldCat');
    });

    const chip = screen.getByTestId('category-chip--oldcat');
    fireEvent.contextMenu(chip, {
      clientX: 120,
      clientY: 80,
      bubbles: true,
      preventDefault: vi.fn(),
    });

    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const input = await screen.findByDisplayValue('OldCat');
    await user.clear(input);
    await user.type(input, 'NewCat{enter}');

    await waitFor(() => {
      expect(screen.getByTestId('category-chip--newcat')).toBeInTheDocument();
      expect(readHomeCategories()).toContain('NewCat');
      expect(readHomeCategories()).not.toContain('OldCat');
    });
  });
});

