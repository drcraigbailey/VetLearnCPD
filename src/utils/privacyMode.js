import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const PRIVACY_KEY = "vetlearn-privacy-mode";
const ROUTE_PREFIX = "privacy-route-";

const routeName = (pathname = window.location.pathname) => {
  if (pathname === "/") return "home";
  return pathname.replace(/^\//, "").replace(/[^a-z0-9-]/gi, "-") || "home";
};

const updateRouteClass = () => {
  if (typeof document === "undefined") return;
  document.body.classList.forEach((className) => {
    if (className.startsWith(ROUTE_PREFIX)) document.body.classList.remove(className);
  });
  document.body.classList.add(`${ROUTE_PREFIX}${routeName()}`);
};

export const isPrivacyModeEnabled = () => {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(PRIVACY_KEY) === "true";
};

export const applyPrivacyMode = (enabled) => {
  if (typeof document === "undefined") return;
  localStorage.setItem(PRIVACY_KEY, String(Boolean(enabled)));
  document.body.classList.toggle("privacy-mode", Boolean(enabled));
  updateRouteClass();
  window.dispatchEvent(new CustomEvent("privacyModeChanged", { detail: { enabled: Boolean(enabled) } }));
};

export const loadPrivacyModeForUser = async (userId) => {
  if (!userId) {
    applyPrivacyMode(false);
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("app_preferences")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("Could not load privacy mode preference:", error.message);
      applyPrivacyMode(isPrivacyModeEnabled());
      return isPrivacyModeEnabled();
    }

    const enabled = data?.app_preferences?.privacyMode === true;
    applyPrivacyMode(enabled);
    return enabled;
  } catch (error) {
    console.warn("Could not load privacy mode preference:", error?.message || error);
    applyPrivacyMode(isPrivacyModeEnabled());
    return isPrivacyModeEnabled();
  }
};

export const initPrivacyModeRuntime = () => {
  if (typeof window === "undefined") return;

  applyPrivacyMode(isPrivacyModeEnabled());

  const refreshForCurrentUser = async () => {
    const { data } = await supabase.auth.getUser();
    await loadPrivacyModeForUser(data?.user?.id);
  };

  refreshForCurrentUser();

  window.addEventListener("settingsUpdated", refreshForCurrentUser);
  window.addEventListener("popstate", updateRouteClass);

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;

  window.history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    window.setTimeout(updateRouteClass, 0);
    return result;
  };

  window.history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    window.setTimeout(updateRouteClass, 0);
    return result;
  };

  supabase.auth.onAuthStateChange((_event, session) => {
    loadPrivacyModeForUser(session?.user?.id);
  });
};

export const usePrivacyMode = () => {
  const [enabled, setEnabled] = useState(isPrivacyModeEnabled);

  useEffect(() => {
    const update = (event) => {
      if (typeof event?.detail?.enabled === "boolean") setEnabled(event.detail.enabled);
      else setEnabled(isPrivacyModeEnabled());
    };

    window.addEventListener("privacyModeChanged", update);
    window.addEventListener("settingsUpdated", update);
    return () => {
      window.removeEventListener("privacyModeChanged", update);
      window.removeEventListener("settingsUpdated", update);
    };
  }, []);

  return enabled;
};

export const privateText = (enabled, value, fallback = "Hidden in privacy mode") => {
  if (!enabled) return value;
  return fallback;
};

export const privateInitial = (enabled, value, fallback = "P") => {
  if (enabled) return fallback;
  return String(value || fallback).charAt(0).toUpperCase();
};
