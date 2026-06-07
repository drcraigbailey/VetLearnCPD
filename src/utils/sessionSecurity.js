import { supabase } from "../supabaseClient";

export const keepMeLoggedInKey = "vetlearn-keep-me-logged-in";
export const lastActivityKey = "vetlearn-last-activity-at";
export const sessionTimeoutMinutesKey = "vetlearn-session-timeout-minutes";

const defaultTimeoutMinutes = 30;
const activityEvents = ["click", "keydown", "mousemove", "touchstart", "scroll"];

const now = () => Date.now();

export const getKeepMeLoggedIn = () => {
  const saved = localStorage.getItem(keepMeLoggedInKey);
  return saved !== "false";
};

export const setKeepMeLoggedIn = (value) => {
  localStorage.setItem(keepMeLoggedInKey, value ? "true" : "false");
  localStorage.setItem(lastActivityKey, String(now()));
  window.dispatchEvent(new Event("sessionSecurityUpdated"));
};

export const getSessionTimeoutMinutes = () => {
  const saved = Number(localStorage.getItem(sessionTimeoutMinutesKey));
  if (Number.isFinite(saved) && saved > 0) return saved;
  return defaultTimeoutMinutes;
};

const timeoutMs = () => getSessionTimeoutMinutes() * 60 * 1000;

const getLastActivity = () => {
  const saved = Number(localStorage.getItem(lastActivityKey));
  return Number.isFinite(saved) && saved > 0 ? saved : now();
};

const markActivity = () => {
  if (getKeepMeLoggedIn()) return;
  localStorage.setItem(lastActivityKey, String(now()));
};

const isExpired = () => !getKeepMeLoggedIn() && now() - getLastActivity() >= timeoutMs();

export const startSessionSecurity = () => {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem(keepMeLoggedInKey)) localStorage.setItem(keepMeLoggedInKey, "true");

  let timer = null;
  let signingOut = false;

  const clearTimer = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
  };

  const lockForInactivity = async () => {
    if (signingOut || getKeepMeLoggedIn()) return;
    signingOut = true;

    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        await supabase.auth.signOut({ scope: "local" });
        window.dispatchEvent(new Event("sessionTimedOut"));
      }
    } finally {
      signingOut = false;
    }
  };

  const schedule = () => {
    clearTimer();
    if (getKeepMeLoggedIn()) return;

    const remaining = timeoutMs() - (now() - getLastActivity());
    if (remaining <= 0) {
      lockForInactivity();
      return;
    }

    timer = window.setTimeout(lockForInactivity, remaining + 250);
  };

  const handleActivity = () => {
    markActivity();
    schedule();
  };

  const handleVisibility = () => {
    if (document.visibilityState === "hidden") {
      markActivity();
      return;
    }

    if (isExpired()) lockForInactivity();
    else schedule();
  };

  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, handleActivity, { passive: true });
  });

  window.addEventListener("focus", handleVisibility);
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("sessionSecurityUpdated", schedule);
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user && !localStorage.getItem(lastActivityKey)) {
      localStorage.setItem(lastActivityKey, String(now()));
    }
    schedule();
  });

  if (isExpired()) lockForInactivity();
  else schedule();
};
