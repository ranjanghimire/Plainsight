import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import './index.css'
import App from './App.jsx'
import { initCapacitorAppLifecycleTracking } from './native/nativeAppLifecycle'
import { installClientErrorReporter } from './telemetry/clientErrorReporter'

installClientErrorReporter()

if (Capacitor.isNativePlatform()) {
  void initCapacitorAppLifecycleTracking()
  void StatusBar.setStyle({ style: Style.Default })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA offline cache on web only; WKWebView + file bundle is unreliable for SW.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}
