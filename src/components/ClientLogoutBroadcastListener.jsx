import { useEffect } from 'react';
import { CLIENT_LOGOUT_BROADCAST_CHANNEL } from '../utils/clearAllLocalClientState';

/** Other tabs reload so in-memory React state cannot show stale workspace data after a wipe. */
export function ClientLogoutBroadcastListener() {
  useEffect(() => {
    let bc = null;
    try {
      bc = new BroadcastChannel(CLIENT_LOGOUT_BROADCAST_CHANNEL);
    } catch {
      return undefined;
    }
    const go = () => {
      window.location.assign('/');
    };
    bc.onmessage = (ev) => {
      if (ev?.data?.type === 'CLEAR') go();
    };
    return () => {
      try {
        bc.close();
      } catch {
        /* ignore */
      }
    };
  }, []);
  return null;
}
