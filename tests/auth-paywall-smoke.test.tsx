/**
 * SendCodeModal + EnableSyncModal smoke (isolated from full app shell).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SendCodeModal } from '../src/components/SendCodeModal';
import { EnableSyncModal } from '../src/components/EnableSyncModal';
import * as sendCodeModule from '../src/auth/sendCode';

vi.mock('../src/auth/sendCode', () => ({
  sendCode: vi.fn(),
}));

describe('SendCodeModal', () => {
  beforeEach(() => {
    vi.mocked(sendCodeModule.sendCode).mockReset();
  });

  it('advances to code step after a successful send', async () => {
    vi.mocked(sendCodeModule.sendCode).mockResolvedValue({
      ok: true,
      userId: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
    });
    const user = userEvent.setup();
    const onClose = vi.fn();
    const loginWithCode = vi.fn().mockResolvedValue({ ok: true });
    render(
      <SendCodeModal open onClose={onClose} loginWithCode={loginWithCode} />,
    );
    await user.type(screen.getByPlaceholderText('you@example.com'), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    });
    expect(screen.getByText(/We sent a code to/i)).toBeInTheDocument();
    expect(sendCodeModule.sendCode).toHaveBeenCalledWith('reader@example.com');
  });

  it('shows an error when sendCode fails', async () => {
    vi.mocked(sendCodeModule.sendCode).mockResolvedValue({
      ok: false,
      error: 'Mailbox unavailable',
    });
    const user = userEvent.setup();
    render(
      <SendCodeModal
        open
        onClose={() => {}}
        loginWithCode={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    await user.type(screen.getByPlaceholderText('you@example.com'), 'bad@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Mailbox unavailable');
    });
  });
});

describe('EnableSyncModal', () => {
  it('calls onClose when Not now is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUnlock = vi.fn();
    render(
      <EnableSyncModal open onClose={onClose} onUnlockSync={onUnlock} unlockDisabled={false} />,
    );
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('invokes onUnlockSync when Unlock Sync is pressed', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn().mockResolvedValue(undefined);
    render(
      <EnableSyncModal open onClose={() => {}} onUnlockSync={onUnlock} unlockDisabled={false} />,
    );
    const unlock = screen.getByRole('button', { name: /Unlock Sync/i });
    await user.click(unlock);
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
    expect(onUnlock.mock.calls[0]?.length ?? 0).toBe(0);
  });

  it('does not invoke purchase when unlockDisabled', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn();
    render(
      <EnableSyncModal open onClose={() => {}} onUnlockSync={onUnlock} unlockDisabled />,
    );
    const unlock = screen.getByRole('button', { name: /Unlock Sync/i });
    expect(unlock).toBeDisabled();
    await user.click(unlock);
    expect(onUnlock).not.toHaveBeenCalled();
  });
});
