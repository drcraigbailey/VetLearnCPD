import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerPwaUpdates } from './pwaUpdate.js'
import { startSessionSecurity } from './utils/sessionSecurity.js'
import { startTextFieldCopyButtons } from './utils/textFieldCopyButtons.js'

registerPwaUpdates()
startSessionSecurity()
startTextFieldCopyButtons()

window.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('button, a, input, textarea, select, label')) return

  const postCard = target.closest('article')
  if (!postCard) return

  const sharedButton = postCard.querySelector('button.w-full.text-left:not(:disabled)')
  if (!sharedButton) return

  sharedButton.click()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
