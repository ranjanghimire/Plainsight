import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthCallbackPage } from './pages/AuthCallbackPage.jsx'

const rootEl = document.getElementById('root')
const path = window.location.pathname.replace(/\/+$/, '') || '/'
const isAuthCallback = path === '/auth/callback'

if (isAuthCallback) {
  // Standalone shell: no app providers or sync so the system browser can finish OAuth
  // without loading workspace / RevenueCat. Session is persisted by the Supabase client.
  createRoot(rootEl).render(<AuthCallbackPage />)
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
  })
}
