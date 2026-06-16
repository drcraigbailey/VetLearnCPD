import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerPwaUpdates } from './pwaUpdate.js'
import { startSessionSecurity } from './utils/sessionSecurity.js'

registerPwaUpdates()
startSessionSecurity()

const scrollToPatientDetails = (attempt = 0) => {
  const patientDetailsHeading = Array.from(document.querySelectorAll('h1, h2, h3')).find(
    (heading) => heading.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() === 'patient details'
  )

  if (patientDetailsHeading) {
    patientDetailsHeading.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }

  if (attempt < 10) {
    window.setTimeout(() => scrollToPatientDetails(attempt + 1), 50)
  }
}

window.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return

  const button = target.closest('button')
  const buttonText = button?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase()
  if (buttonText !== 'calc dose') return

  window.setTimeout(() => window.requestAnimationFrame(() => scrollToPatientDetails()), 0)
})

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
