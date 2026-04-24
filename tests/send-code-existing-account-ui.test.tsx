/**
 * SendCodeModal: existing-account block + clear-device path.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SendCodeModal } from '../src/components/SendCodeModal';
import * as sendCodeModule from '../src/auth/sendCode';
import * as clearModule from '../src/utils/clearAllLocalClientState';
import * as blockModule from '../src/utils/signInExistingAccountBlock';

vi.mock('../src/auth/sendCode', () => ({
  sendCode: vi.fn(),
}));

vi.mock('../src/utils/clearAllLocalClientState', () => ({
  clearAllLocalClientState: vi.fn(async () => {}),
}));

vi.mock('../src/utils/signInExistingAccountBlock', () => ({
  shouldBlockExistingAccountSignIn: vi.fn(() => false),
}));

vi.mock('../src/auth/checkSyncEntitlementRemote', () => ({
  checkSyncEntitlementRemote: vi.fn(async () => null),
}));

describe('SendCodeModal existing-account gate', () => {
  beforeEach(() => {
    vi.mocked(sendCodeModule.sendCode).mockReset();
    vi.mocked(clearModule.clearAllLocalClientState).mockClear();
    vi.mocked(blockModule.shouldBlockExistingAccountSignIn).mockReset();
    vi.mocked(blockModule.shouldBlockExistingAccountSignIn).mockReturnValue(false);
  });

  it('shows the block dialog when accountExists and shouldBlockExistingAccountSignIn', async () => {
    vi.mocked(blockModule.shouldBlockExistingAccountSignIn).mockReturnValue(true);
    vi.mocked(sendCodeModule.sendCode).mockResolvedValue({
      ok: true,
      userId: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
      accountExists: true,
    });
    const user = userEvent.setup();
    render(
      <SendCodeModal open onClose={() => {}} loginWithCode={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    await user.type(screen.getByPlaceholderText('you@example.com'), 'existing@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /already exists in the cloud/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/existing@example.com/i)).toBeInTheDocument();
  });

  it('clears device and continues to the code step', async () => {
    vi.mocked(blockModule.shouldBlockExistingAccountSignIn).mockReturnValue(true);
    vi.mocked(sendCodeModule.sendCode)
      .mockResolvedValueOnce({
        ok: true,
        userId: 'u1',
        accountExists: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        userId: 'u1',
        accountExists: true,
      });

    const user = userEvent.setup();
    render(
      <SendCodeModal open onClose={() => {}} loginWithCode={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    await user.type(screen.getByPlaceholderText('you@example.com'), 'existing@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Clear this device & continue/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Clear this device & continue/i }));
    await waitFor(() => {
      expect(clearModule.clearAllLocalClientState).toHaveBeenCalledWith('signin_clear');
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    });
    expect(sendCodeModule.sendCode).toHaveBeenCalledTimes(2);
    expect(sendCodeModule.sendCode).toHaveBeenLastCalledWith('existing@example.com');
  });
});
