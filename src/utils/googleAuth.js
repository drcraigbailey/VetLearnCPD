import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";

import { supabase } from "../supabaseClient";

const NativeBrowser = registerPlugin("NativeBrowser");
const GOOGLE_SIGNUP_KEY = "vetlearn-google-signup";

export const nativeOAuthRedirectUrl = "com.vetlearn.cpd://auth/callback";

export const isNativeApp = () => Capacitor.isNativePlatform();

export async function startGoogleSignIn({ signupMetadata = null } = {}) {
  if (signupMetadata) {
    localStorage.setItem(GOOGLE_SIGNUP_KEY, JSON.stringify(signupMetadata));
  } else {
    localStorage.removeItem(GOOGLE_SIGNUP_KEY);
  }

  const redirectTo = isNativeApp()
    ? nativeOAuthRedirectUrl
    : `${window.location.origin}/`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: isNativeApp(),
      queryParams: {
        access_type: "offline",
        prompt: "select_account"
      }
    }
  });

  if (error) throw error;

  if (isNativeApp()) {
    if (!data?.url) throw new Error("Google did not return a sign-in URL.");
    await NativeBrowser.open({ url: data.url });
  }
}

export async function handleNativeOAuthCallback(url) {
  if (!url?.startsWith(nativeOAuthRedirectUrl)) return false;

  const callbackUrl = new URL(url);
  const providerError = callbackUrl.searchParams.get("error_description")
    || callbackUrl.searchParams.get("error");

  if (providerError) throw new Error(providerError);

  const code = callbackUrl.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    await applyPendingGoogleSignupMetadata();
    return true;
  }

  const fragment = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (!accessToken || !refreshToken) {
    throw new Error("Google sign-in returned without a session code.");
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });
  if (error) throw error;

  await applyPendingGoogleSignupMetadata();
  return true;
}

export async function applyPendingGoogleSignupMetadata() {
  const rawMetadata = localStorage.getItem(GOOGLE_SIGNUP_KEY);
  if (!rawMetadata) return;

  try {
    const metadata = JSON.parse(rawMetadata);
    const { error } = await supabase.auth.updateUser({ data: metadata });
    if (error) throw error;
    localStorage.removeItem(GOOGLE_SIGNUP_KEY);
  } catch (error) {
    console.error("Could not save Google sign-up consent metadata", error);
    throw error;
  }
}

export async function listenForNativeOAuthCallbacks(onSuccess, onError) {
  if (!isNativeApp()) return () => {};

  let handling = false;
  const processUrl = async (url) => {
    if (handling || !url?.startsWith(nativeOAuthRedirectUrl)) return;
    handling = true;
    try {
      const handled = await handleNativeOAuthCallback(url);
      if (handled) onSuccess?.();
    } catch (error) {
      console.error("Google OAuth callback failed", error);
      onError?.(error);
    } finally {
      handling = false;
    }
  };

  const listener = await CapacitorApp.addListener("appUrlOpen", ({ url }) => processUrl(url));
  const launch = await CapacitorApp.getLaunchUrl();
  if (launch?.url) await processUrl(launch.url);

  return () => listener.remove();
}
