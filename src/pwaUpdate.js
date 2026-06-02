import { registerSW } from "virtual:pwa-register";

export function registerPwaUpdates() {
  if (import.meta.env.DEV) return;

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
