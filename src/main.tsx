import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isNative } from './lib/native'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The native app (D115) has no service worker: it is served from the app
// bundle and its notifications come through Apple's push service later.
if (!isNative() && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}
