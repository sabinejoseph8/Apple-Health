import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { demo } from './demo/boot'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (!demo && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}
