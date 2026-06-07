import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "capacitor-native-biometric";
import { supabase } from "../supabaseClient";

const credentialPrefix = "vetlearn-biometric-credential";
const enabledPrefix = "vetlearn-biometric-enabled";
const loginEnabledKey = "vetlearn-biometric-login-enabled";
const lastUserKey = "vetlearn-biometric-last-user";
const relinkAfterPasswordKey = "vetlearn-biometric-relink-after-password";
const nativeServer = "vetlearn-cpd";

const randomChallenge = () => {
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  return challenge;
};

const textToBytes = (text) => new TextEncoder().encode(text);

const bufferToBase64Url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlToBuffer = (base64url) => {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
};

const credentialKey = (userId) => `${credentialPrefix}-${userId}`;
const enabledKey = (userId) => `${enabledPrefix}-${userId}`;
const isNative = () => Capacitor?.isNativePlatform?.() === true;

const saveLoginHint = (user) => {
  localStorage.setItem(loginEnabledKey, "true");
  localStorage.setItem(lastUserKey, JSON.stringify({ id: user.id, email: user.email || "" }));
};

const clearLoginHint = (userId) => {
  const saved = getLastBiometricUser();
  if (!saved || String(saved.id) === String(userId)) {
    localStorage.removeItem(loginEnabledKey);
    localStorage.removeItem(lastUserKey);
  }
};

const requestRelinkAfterPasswordLogin = (userId) => {
  if (userId) localStorage.setItem(relinkAfterPasswordKey, String(userId));
};

const clearRelinkFlag = (userId) => {
  if (!userId || localStorage.getItem(relinkAfterPasswordKey) === String(userId)) {
    localStorage.removeItem(relinkAfterPasswordKey);
  }
};

export const getLastBiometricUser = () => {
  try {
    return JSON.parse(localStorage.getItem(lastUserKey) || "null");
  } catch {
    return null;
  }
};

export const needsBiometricRelink = () => Boolean(localStorage.getItem(relinkAfterPasswordKey));

const loadNativeBiometric = () => {
  if (!isNative()) return null;
  return NativeBiometric || null;
};

const verifyNativeIdentity = async (biometricPlugin) => {
  await biometricPlugin.verifyIdentity({
    reason: "Unlock VetLearn",
    title: "Unlock VetLearn",
    subtitle: "Confirm it is you",
    description: "Use fingerprint, Face ID or your device screen lock to continue."
  });
  return true;
};

const buildTokenPayload = (user, session) => ({
  user_id: user.id,
  email: user.email || "",
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_at: session.expires_at || null,
  saved_at: new Date().toISOString()
});

const hasUsableRefreshToken = (credentials) => Boolean(credentials?.refresh_token && credentials?.user_id);

const hasFreshAccessToken = (credentials) => {
  if (!credentials?.access_token || !credentials?.expires_at) return false;
  const expiresAtMs = Number(credentials.expires_at) * 1000;
  return Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() > 60_000;
};

const saveNativeSessionCredentials = async (biometricPlugin, user, session) => {
  await biometricPlugin.setCredentials({
    username: user.email || user.id,
    password: JSON.stringify(buildTokenPayload(user, session)),
    server: nativeServer
  });
};

const getNativeCredentials = async (biometricPlugin) => {
  const credentials = await biometricPlugin.getCredentials({ server: nativeServer });
  if (!credentials?.password) {
    const savedUser = getLastBiometricUser();
    if (savedUser?.id || localStorage.getItem(loginEnabledKey) === "true") {
      requestRelinkAfterPasswordLogin(savedUser?.id);
      throw new Error("Fingerprint login needs refreshing. Please log in with email and password once.");
    }
    throw new Error("Please log in with email and password first to set up fingerprint login.");
  }

  try {
    const parsed = JSON.parse(credentials.password);
    if (!hasUsableRefreshToken(parsed)) {
      requestRelinkAfterPasswordLogin(parsed?.user_id || getLastBiometricUser()?.id);
      throw new Error("Fingerprint login needs refreshing. Please log in with email and password once.");
    }
    return parsed;
  } catch (error) {
    if (error?.message?.includes("Fingerprint login needs refreshing")) throw error;
    requestRelinkAfterPasswordLogin(getLastBiometricUser()?.id);
    throw new Error("Fingerprint login needs refreshing. Please log in with email and password once.");
  }
};

const clearNativeBiometricCredentials = async (biometricPlugin, userId, { relink = false } = {}) => {
  try {
    await biometricPlugin?.deleteCredentials?.({ server: nativeServer });
  } catch {
    // Credentials may already be missing; local flags still need clearing.
  }

  if (userId) {
    localStorage.removeItem(enabledKey(userId));
    if (relink) {
      requestRelinkAfterPasswordLogin(userId);
    } else {
      clearLoginHint(userId);
      clearRelinkFlag(userId);
    }
  } else {
    localStorage.removeItem(loginEnabledKey);
    localStorage.removeItem(lastUserKey);
    localStorage.removeItem(relinkAfterPasswordKey);
  }
};

const markBiometricReady = (user) => {
  localStorage.setItem(enabledKey(user.id), "true");
  clearRelinkFlag(user.id);
  saveLoginHint(user);
  window.dispatchEvent(new Event("biometricSettingsUpdated"));
};

const restoreSupabaseSession = async (biometricPlugin, credentials) => {
  if (!hasUsableRefreshToken(credentials)) {
    requestRelinkAfterPasswordLogin(credentials?.user_id);
    throw new Error("Fingerprint login needs refreshing. Please log in with email and password once.");
  }

  let restored = null;
  let restoreError = null;

  if (hasFreshAccessToken(credentials)) {
    const { data, error } = await supabase.auth.setSession({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token
    });
    restored = data?.session || null;
    restoreError = error || null;
  }

  if (!restored || restoreError) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: credentials.refresh_token });
    restored = data?.session || null;
    restoreError = error || null;
  }

  if (restoreError || !restored?.user) {
    requestRelinkAfterPasswordLogin(credentials.user_id);
    throw new Error("Fingerprint login needs refreshing. Please log in with email and password once.");
  }

  await syncBiometricSession(restored.user, restored);
  markBiometricReady(restored.user);
  return restored;
};

export const isBiometricAvailable = async () => {
  const biometricPlugin = loadNativeBiometric();
  if (biometricPlugin) {
    try {
      const result = await biometricPlugin.isAvailable();
      return Boolean(result?.isAvailable);
    } catch {
      return false;
    }
  }

  if (!window.PublicKeyCredential || !navigator.credentials) return false;
  if (!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

export const isBiometricLoginEnabled = async () => {
  if (localStorage.getItem(loginEnabledKey) !== "true") return false;
  const available = await isBiometricAvailable();
  if (!available) return false;

  const biometricPlugin = loadNativeBiometric();
  if (!biometricPlugin) return true;

  try {
    const credentials = await getNativeCredentials(biometricPlugin);
    return hasUsableRefreshToken(credentials);
  } catch {
    return true;
  }
};

export const isBiometricEnabled = (userId) => {
  if (isNative()) return localStorage.getItem(enabledKey(userId)) === "true";
  return localStorage.getItem(enabledKey(userId)) === "true" && Boolean(localStorage.getItem(credentialKey(userId)));
};

export const syncBiometricSession = async (user, session) => {
  if (!user?.id || !session?.access_token || !session?.refresh_token) return;

  const shouldSync = isBiometricEnabled(user.id) || localStorage.getItem(relinkAfterPasswordKey) === String(user.id);
  if (!shouldSync) return;

  const biometricPlugin = loadNativeBiometric();
  if (!biometricPlugin) return;

  try {
    await saveNativeSessionCredentials(biometricPlugin, user, session);
    markBiometricReady(user);
  } catch {
    // The app can still run normally; re-enable biometric login in Settings if needed.
  }
};

export const refreshBiometricAfterPasswordLogin = async (user, session) => {
  if (!user?.id || !session?.access_token || !session?.refresh_token) return false;
  if (localStorage.getItem(relinkAfterPasswordKey) !== String(user.id) && !isBiometricEnabled(user.id)) return false;

  const biometricPlugin = loadNativeBiometric();
  if (!biometricPlugin) return false;

  const result = await biometricPlugin.isAvailable();
  if (!result?.isAvailable) throw new Error("Fingerprint or Face ID is not available on this device.");

  await saveNativeSessionCredentials(biometricPlugin, user, session);
  markBiometricReady(user);
  return true;
};

export const registerBiometric = async (user, providedSession = null) => {
  const biometricPlugin = loadNativeBiometric();
  if (biometricPlugin) {
    const result = await biometricPlugin.isAvailable();
    if (!result?.isAvailable) throw new Error("Fingerprint or Face ID is not available on this device.");

    const session = providedSession || (await supabase.auth.getSession()).data?.session;
    if (!session?.access_token || !session?.refresh_token) {
      throw new Error("Please sign in again before enabling fingerprint login.");
    }

    await verifyNativeIdentity(biometricPlugin);
    await saveNativeSessionCredentials(biometricPlugin, user, session);
    markBiometricReady(user);
    return true;
  }

  const available = await isBiometricAvailable();
  if (!available) throw new Error("Fingerprint or Face ID is not available on this device/browser.");

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: "VetLearn" },
      user: {
        id: textToBytes(user.id),
        name: user.email || user.id,
        displayName: user.email || "VetLearn user"
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 }
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required"
      },
      timeout: 60000,
      attestation: "none"
    }
  });

  if (!credential?.rawId) throw new Error("Fingerprint setup was cancelled.");
  localStorage.setItem(credentialKey(user.id), bufferToBase64Url(credential.rawId));
  markBiometricReady(user);
  return true;
};

export const authenticateBiometric = async (user) => {
  const biometricPlugin = loadNativeBiometric();
  if (biometricPlugin) {
    const result = await biometricPlugin.isAvailable();
    if (!result?.isAvailable) throw new Error("Fingerprint or Face ID is not available on this device.");

    await verifyNativeIdentity(biometricPlugin);
    const credentials = await getNativeCredentials(biometricPlugin);
    await restoreSupabaseSession(biometricPlugin, credentials);
    return true;
  }

  const credentialId = localStorage.getItem(credentialKey(user.id));
  if (!credentialId) throw new Error("Fingerprint unlock is not set up on this device.");

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [
        { type: "public-key", id: base64UrlToBuffer(credentialId) }
      ],
      userVerification: "required",
      timeout: 60000
    }
  });

  return Boolean(assertion);
};

export const signInWithBiometric = async () => {
  const biometricPlugin = loadNativeBiometric();
  if (biometricPlugin) {
    const result = await biometricPlugin.isAvailable();
    if (!result?.isAvailable) throw new Error("Fingerprint or Face ID is not available on this device.");

    await verifyNativeIdentity(biometricPlugin);
    const credentials = await getNativeCredentials(biometricPlugin);
    await restoreSupabaseSession(biometricPlugin, credentials);
    return true;
  }

  const savedUser = getLastBiometricUser();
  if (!savedUser?.id || !isBiometricEnabled(savedUser.id)) {
    throw new Error("Please log in with email and password first.");
  }

  await authenticateBiometric(savedUser);
  throw new Error("Fingerprint login on web needs a fresh email and password login first.");
};

export const disableBiometric = async (userId) => {
  const biometricPlugin = loadNativeBiometric();
  if (biometricPlugin) {
    await clearNativeBiometricCredentials(biometricPlugin, userId);
  }

  localStorage.removeItem(credentialKey(userId));
  localStorage.removeItem(enabledKey(userId));
  localStorage.removeItem(relinkAfterPasswordKey);
  clearLoginHint(userId);
};
