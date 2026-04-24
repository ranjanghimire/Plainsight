import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignOutDataLossDialog } from '../src/components/SignOutDataLossDialog';

describe('SignOutDataLossDialog', () => {
  it('requires typing SIGN OUT before confirm runs', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <SignOutDataLossDialog open onCancel={vi.fn()} onConfirm={onConfirm} />,
    );
    const confirmBtn = screen.getByRole('button', { name: /Sign out & wipe device/i });
    expect(confirmBtn).toBeDisabled();
    await user.type(screen.getByPlaceholderText('SIGN OUT'), 'SIGN OUT');
    expect(confirmBtn).not.toBeDisabled();
    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
