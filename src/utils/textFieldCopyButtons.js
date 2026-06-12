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

const COPY_ICON = `
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
`

const isCopyableTextField = (element) => {
  if (!(element instanceof HTMLElement)) return false

  if (element.matches('[data-no-copy-button="true"]')) return false
  if (element.isContentEditable) return true
  if (element instanceof HTMLTextAreaElement) return !element.disabled

  if (element instanceof HTMLInputElement) {
    const type = (element.type || 'text').toLowerCase()
    return COPYABLE_INPUT_TYPES.has(type) && !element.disabled && !element.readOnly
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

const isVisibleInViewport = (element) => {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth
}

export const startTextFieldCopyButtons = () => {
  if (hasStarted || typeof window === 'undefined') return
  hasStarted = true

  const fieldButtons = new Map()
  let scanQueued = false
  let positionQueued = false

  const setButtonCopiedState = (button, copied) => {
    window.clearTimeout(button._vetlearnResetTimer)
    button.classList.toggle('is-copied', copied)
    button.innerHTML = copied ? '<span aria-hidden="true">✓</span>' : COPY_ICON

    if (copied) {
      button._vetlearnResetTimer = window.setTimeout(() => setButtonCopiedState(button, false), 1200)
    }
  }

  const removeButtonForField = (field) => {
    const button = fieldButtons.get(field)
    if (!button) return
    window.clearTimeout(button._vetlearnResetTimer)
    button.remove()
    fieldButtons.delete(field)
  }

  const ensureButtonForField = (field) => {
    if (!isCopyableTextField(field)) return null

    const existing = fieldButtons.get(field)
    if (existing) return existing

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'vetlearn-copy-field-button'
    button.setAttribute('aria-label', 'Copy text')
    button.innerHTML = COPY_ICON

    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
    })

    button.addEventListener('click', async (event) => {
      event.preventDefault()
      event.stopPropagation()

      const copied = await copyText(getFieldText(field))
      setButtonCopiedState(button, copied)
      field.focus?.({ preventScroll: true })
    })

    document.body.appendChild(button)
    fieldButtons.set(field, button)
    return button
  }

  const updateButtonPosition = (field, button) => {
    if (!document.body.contains(field) || !isCopyableTextField(field)) {
      removeButtonForField(field)
      return
    }

    const text = getFieldText(field).trim()
    if (!text || !isVisibleInViewport(field)) {
      button.classList.remove('is-visible')
      return
    }

    const rect = field.getBoundingClientRect()
    const buttonSize = 34
    const edgePadding = 8
    const topOffset = Math.max(edgePadding, Math.min(14, (rect.height - buttonSize) / 2))

    button.style.left = `${Math.max(edgePadding, rect.right - buttonSize - edgePadding)}px`
    button.style.top = `${Math.max(edgePadding, rect.top + topOffset)}px`
    button.classList.add('is-visible')
  }

  const updateAllPositions = () => {
    positionQueued = false
    fieldButtons.forEach((button, field) => updateButtonPosition(field, button))
  }

  const queuePositionUpdate = () => {
    if (positionQueued) return
    positionQueued = true
    window.requestAnimationFrame(updateAllPositions)
  }

  const scanForTextFields = () => {
    scanQueued = false

    document
      .querySelectorAll('input, textarea, [contenteditable="true"]')
      .forEach((field) => {
        if (!isCopyableTextField(field)) return
        const button = ensureButtonForField(field)
        if (button) updateButtonPosition(field, button)
      })

    fieldButtons.forEach((_, field) => {
      if (!document.body.contains(field)) removeButtonForField(field)
    })
  }

  const queueScan = () => {
    if (scanQueued) return
    scanQueued = true
    window.requestAnimationFrame(scanForTextFields)
  }

  document.addEventListener('focusin', queueScan)
  document.addEventListener('input', queueScan)
  document.addEventListener('change', queueScan)
  window.addEventListener('resize', queuePositionUpdate)
  window.addEventListener('scroll', queuePositionUpdate, true)

  const observer = new MutationObserver(queueScan)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['value', 'class', 'style', 'disabled', 'readonly'],
  })

  queueScan()
  window.setTimeout(queueScan, 500)
  window.setTimeout(queueScan, 1500)
}
