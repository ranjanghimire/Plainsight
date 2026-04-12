import { EDGE_FUNCTION_TIMEOUT_MS } from './networkBudget';

type InvokeResult<T> = { data: T | null; error: string | null };

/**
 * Races an Edge Function invoke against a timeout so degraded networks fail fast
 * instead of hanging until the platform TCP stack gives up.
 */
export async function raceInvokeWithTimeout<T>(
  invoke: () => Promise<InvokeResult<T>>,
  timeoutMs: number = EDGE_FUNCTION_TIMEOUT_MS,
): Promise<InvokeResult<T>> {
  const timedOut: InvokeResult<T> = { data: null, error: 'timeout' };
  try {
    return await Promise.race([
      invoke(),
      new Promise<InvokeResult<T>>((resolve) => {
        setTimeout(() => resolve(timedOut), timeoutMs);
      }),
    ]);
  } catch {
    return { data: null, error: 'network' };
  }
}
