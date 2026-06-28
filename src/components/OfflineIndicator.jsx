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
    <>
      <style>
        {`@keyframes vetlearnOfflineDrop { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}
      </style>
      <div
        role="status"
        aria-live="polite"
        style={{ animation: 'vetlearnOfflineDrop 220ms ease-out' }}
        className={`w-full border-b px-4 py-2.5 shadow-[0_8px_24px_rgba(11,55,96,0.12)] ${
          darkMode
            ? 'border-[#71CFC2]/25 bg-[#071A24] text-slate-100'
            : 'border-[#DCEDEA] bg-white text-[#0B3760]'
        }`}
      >
        <div className="mx-auto flex max-w-md items-center gap-3">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${darkMode ? 'bg-white/10 text-[#71CFC2]' : 'bg-[#E8F8F5] text-[#0B3760]'}`}>
            <WifiOff size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-black leading-tight">
            You are offline
            <span className={`ml-2 text-xs font-semibold ${darkMode ? 'text-slate-300' : 'text-[#0F8F83]'}`}>
              Offline content will still open where available.
            </span>
          </span>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#71CFC2]" aria-hidden="true" />
        </div>
      </div>
    </>
  )
}
