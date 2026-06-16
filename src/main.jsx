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
    const patientDetailsCard = patientDetailsHeading.closest('section, .rounded-lg, .rounded-xl, div') || patientDetailsHeading
    const headerOffset = 190
    const top = window.scrollY + patientDetailsCard.getBoundingClientRect().top - headerOffset

    window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' })
    return
  }

  if (attempt < 14) {
    window.setTimeout(() => scrollToPatientDetails(attempt + 1), 60)
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
