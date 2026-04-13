import { registerPlugin } from '@capacitor/core';

/** Native VisionKit live text scanner on iOS; `jsName` matches `LiveTextScannerPlugin.jsName`. */
export const LiveTextScanner = registerPlugin('LiveTextScanner', {
  web: () => ({
    getHardwareSupport: async () => ({ hardware: false }),
    scanText: async () => ({ cancelled: true }),
  }),
});
