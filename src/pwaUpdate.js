import { Capacitor } from "@capacitor/core";
import { registerSW } from "virtual:pwa-register";

async function clearNativePwaCaches() {
  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map(cacheName => window.caches.delete(cacheName)));
    }
  } catch (error) {
    console.warn("VetLearn native PWA cache cleanup failed:", error);
  }
}

export function registerPwaUpdates() {
  if (import.meta.env.DEV) return;
  if (Capacitor.isNativePlatform?.()) {
    clearNativePwaCaches();
    return;
  }

  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateServiceWorker(true);
    },
    onOfflineReady() {
      console.info("VetLearn is ready for offline use.");
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.warn("VetLearn service worker registration failed:", error);
    }
  });
}
