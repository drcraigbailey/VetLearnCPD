import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerPwaUpdates } from './pwaUpdate.js'
import { startSessionSecurity } from './utils/sessionSecurity.js'

registerPwaUpdates()
startSessionSecurity()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
