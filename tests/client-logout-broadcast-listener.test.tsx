import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientLogoutBroadcastListener } from '../src/components/ClientLogoutBroadcastListener';
import { CLIENT_LOGOUT_BROADCAST_CHANNEL } from '../src/utils/clearAllLocalClientState';

describe('ClientLogoutBroadcastListener', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reloads the app when the broadcast channel receives CLEAR', () => {
    const instances: Array<{ onmessage: ((ev: MessageEvent) => void) | null }> = [];
    class TestBC {
      onmessage: ((ev: MessageEvent) => void) | null = null;
      constructor() {
        instances.push(this);
      }

      postMessage(data: unknown) {
        const msg = { data } as MessageEvent;
        for (const inst of instances) {
          inst.onmessage?.(msg);
        }
      }

      close() {}
    }
    vi.stubGlobal('BroadcastChannel', TestBC as unknown as typeof BroadcastChannel);

    const assign = vi.fn();
    const prev = window.location;
    // jsdom: `location.assign` is not spyable; replace `window.location` for this test only.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).location = { ...prev, assign };

    render(<ClientLogoutBroadcastListener />);
    const bc = new BroadcastChannel(CLIENT_LOGOUT_BROADCAST_CHANNEL);
    bc.postMessage({ type: 'CLEAR', reason: 'logout', t: 1 });
    expect(assign).toHaveBeenCalledWith('/');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    window.location = prev;

    vi.unstubAllGlobals();
  });
});
