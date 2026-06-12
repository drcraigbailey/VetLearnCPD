const COPYABLE_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
])

let hasStarted = false

const isCopyableTextField = (element) => {
  if (!(element instanceof HTMLElement)) return false

  if (element.matches('[data-no-copy-button="true"]')) return false
  if (element.isContentEditable) return true
  if (element instanceof HTMLTextAreaElement) return true

  if (element instanceof HTMLInputElement) {
    const type = (element.type || 'text').toLowerCase()
    return COPYABLE_INPUT_TYPES.has(type) && !element.disabled
  }

  return false
}

const getFieldText = (element) => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value || ''
  }

  if (element.isContentEditable) {
    return element.innerText || element.textContent || ''
  }

  return ''
}

const copyText = async (text) => {
  if (!text) return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (_) {
    // Fall through to the old-school clipboard path below.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch (_) {
    copied = false
  }

  textarea.remove()
  return copied
}

export const startTextFieldCopyButtons = () => {
  if (hasStarted || typeof window === 'undefined') return
  hasStarted = true

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'vetlearn-copy-field-button'
  button.setAttribute('aria-label', 'Copy text')
  button.innerHTML = `
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `
  document.body.appendChild(button)

  let activeField = null
  let resetTimer = null

  const setButtonCopiedState = (copied) => {
    clearTimeout(resetTimer)
    button.classList.toggle('is-copied', copied)
    button.innerHTML = copied
      ? '<span aria-hidden="true">✓</span>'
      : `
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      `

    if (copied) {
      resetTimer = window.setTimeout(() => setButtonCopiedState(false), 1200)
    }
  }

  const hideButton = () => {
    activeField = null
    button.classList.remove('is-visible')
    setButtonCopiedState(false)
  }

  const updateButtonPosition = () => {
    if (!activeField || !document.body.contains(activeField)) {
      hideButton()
      return
    }

    const text = getFieldText(activeField).trim()
    if (!text) {
      button.classList.remove('is-visible')
      return
    }

    const rect = activeField.getBoundingClientRect()
    const buttonSize = 34
    const edgePadding = 8

    if (rect.width <= 0 || rect.height <= 0) {
      button.classList.remove('is-visible')
      return
    }

    button.style.left = `${Math.max(edgePadding, rect.right - buttonSize - edgePadding)}px`
    button.style.top = `${Math.max(edgePadding, rect.top + Math.min(edgePadding, (rect.height - buttonSize) / 2))}px`
    button.classList.add('is-visible')
  }

  const activateField = (element) => {
    if (!isCopyableTextField(element)) return
    activeField = element
    setButtonCopiedState(false)
    updateButtonPosition()
  }

  document.addEventListener('focusin', (event) => {
    activateField(event.target)
  })

  document.addEventListener('click', (event) => {
    if (event.target === button || button.contains(event.target)) return
    activateField(event.target)
  })

  document.addEventListener('input', (event) => {
    if (event.target === activeField) updateButtonPosition()
  })

  document.addEventListener('focusout', (event) => {
    if (event.target !== activeField) return
    window.setTimeout(() => {
      if (document.activeElement !== button && document.activeElement !== activeField) {
        hideButton()
      }
    }, 120)
  })

  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })

  button.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()

    if (!activeField) return

    const copied = await copyText(getFieldText(activeField))
    setButtonCopiedState(copied)
    activeField.focus?.()
  })

  window.addEventListener('resize', updateButtonPosition)
  window.addEventListener('scroll', updateButtonPosition, true)
}
