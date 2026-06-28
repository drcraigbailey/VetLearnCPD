import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

function getThemeIsDark() {
  if (typeof window === 'undefined') return false
  const savedTheme = window.localStorage.getItem('vetlearn-theme')
  if (savedTheme) return savedTheme === 'dark'
  return document.querySelector('.vetlearn-app-shell')?.classList.contains('dark') || false
}

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false))
  const [darkMode, setDarkMode] = useState(getThemeIsDark)

  useEffect(() => {
    const updateOnlineStatus = () => setIsOffline(!navigator.onLine)
    updateOnlineStatus()
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    const updateTheme = () => setDarkMode(getThemeIsDark())
    const observer = new MutationObserver(updateTheme)
    updateTheme()
    observer.observe(document.body, { attributes: true, childList: true, subtree: true })
    window.addEventListener('storage', updateTheme)
    return () => {
      observer.disconnect()
      window.removeEventListener('storage', updateTheme)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.6rem+env(safe-area-inset-bottom))] z-[75] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-full border px-4 py-3 text-sm font-black shadow-[0_14px_34px_rgba(11,55,96,0.22)] backdrop-blur-xl transition ${
          darkMode
            ? 'border-[#71CFC2]/30 bg-[#071A24]/95 text-slate-100'
            : 'border-[#DCEDEA] bg-white/95 text-[#0B3760]'
        }`}
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${darkMode ? 'bg-white/10 text-[#71CFC2]' : 'bg-[#E8F8F5] text-[#0B3760]'}`}>
          <WifiOff size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block leading-tight">You are offline</span>
          <span className={`block text-xs font-semibold leading-tight ${darkMode ? 'text-slate-300' : 'text-[#0F8F83]'}`}>
            Offline content will still open where available.
          </span>
        </span>
        <span className="ml-1 h-3 w-3 shrink-0 rounded-full bg-[#71CFC2]" aria-hidden="true" />
      </div>
    </div>
  )
}
