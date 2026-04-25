import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * Mirrors Capacitor `App` foreground/background from `appStateChange` (synchronous reads).
 * `App.getState()` alone is unreliable around resume: realtime callbacks often run after
 * `isActive` is already true, or WKWebView can report active while the user has left the app.
 */
let nativeAppIsActive = true;
let lifecycleInitialized = false;

export async function initCapacitorAppLifecycleTracking(): Promise<void> {
  if (!Capacitor.isNativePlatform() || lifecycleInitialized) return;
  lifecycleInitialized = true;
  try {
    const st = await App.getState();
    nativeAppIsActive = st.isActive === true;
  } catch {
    nativeAppIsActive = true;
  }
  void App.addListener('appStateChange', (state) => {
    nativeAppIsActive = state.isActive === true;
  });
}

/** True when the native shell last reported the app is in the background. */
export function isNativeAppInBackgroundSync(): boolean {
  return !nativeAppIsActive;
}
