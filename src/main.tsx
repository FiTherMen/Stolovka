import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isDemo } from './lib/demo'
import { initTelegram } from './lib/telegram'
import './styles.css'

initTelegram()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD && !isDemo) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
