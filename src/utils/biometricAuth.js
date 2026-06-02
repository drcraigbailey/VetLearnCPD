import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "capacitor-native-biometric";
import { supabase } from "../supabaseClient";

const credentialPrefix = "vetlearn-biometric-credential";
const enabledPrefix = "vetlearn-biometric-enabled";
const loginEnabledKey = "vetlearn-biometric-login-enabled";
const lastUserKey = "vetlearn-biometric-last-user";
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

export const getLastBiometricUser = () => {
  try {
    return JSON.parse(localStorage.getItem(lastUserKey) || "null");
  } catch {
    return null;
  }
};

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
  refresh_token: session.refresh_token
});

const saveNativeSessionCredentials = async (biometricPlugin, user, session) => {
  await biometricPlugin.setCredentials({
    username: user.email || user.id,
    password: JSON.stringify(buildTokenPayload(user, session)),
    server: nativeServer
  });
};

const getNativeCredentials = async (biometricPlugin) => {
  const credentials = await biometricPlugin.getCredentials({ server: nativeServer });
  if (!credentials?.password) throw new Error("Please log in with email and password first.");

  try {
    return JSON.parse(credentials.password);
  } catch {
    throw new Error("Please turn fingerprint login off and on again in Settings.");
  }
};

const clearNativeBiometricCredentials = async (biometricPlugin, userId) => {
  try {
    await biometricPlugin?.deleteCredentials?.({ server: nativeServer });
  } catch {
    // Credentials may already be missing; local flags still need clearing.
  }

  if (userId) {
    localStorage.removeItem(enabledKey(userId));
    clearLoginHint(userId);
  } else {
    localStorage.removeItem(loginEnabledKey);
    localStorage.removeItem(lastUserKey);
  }
};

const restoreSupabaseSession = async (biometricPlugin, credentials) => {
  if (!credentials?.refresh_token) {
    await clearNativeBiometricCredentials(biometricPlugin, credentials?.user_id);
    throw new Error("Please log in with email and password first.");
  }

  let restored = null;
  let restoreError = null;

  if (credentials.access_token) {
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
    await clearNativeBiometricCredentials(biometricPlugin, credentials.user_id);
    throw new Error("Session expired. Please log in with email and password first.");
  }

  await syncBiometricSession(restored.user, restored);
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
  return isBiometricAvailable();
};

export const isBiometricEnabled = (userId) => {
  if (isNative()) return localStorage.getItem(enabledKey(userId)) === "true";
  return localStorage.getItem(enabledKey(userId)) === "true" && Boolean(localStorage.getItem(credentialKey(userId)));
};

export const syncBiometricSession = async (user, session) => {
  if (!user?.id || !session?.access_token || !session?.refresh_token || !isBiometricEnabled(user.id)) return;

  const biometricPlugin = loadNativeBiometric();
  if (!biometricPlugin) return;

  try {
    await saveNativeSessionCredentials(biometricPlugin, user, session);
    saveLoginHint(user);
  } catch {
    // The app can still run normally; re-enable biometric login in Settings if needed.
  }
};

export const registerBiometric = async (user) => {
  const biometricPlugin = loadNativeBiometric();
  if (biometricPlugin) {
    const result = await biometricPlugin.isAvailable();
    if (!result?.isAvailable) throw new Error("Fingerprint or Face ID is not available on this device.");

    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.access_token || !session?.refresh_token) {
      throw new Error("Please sign in again before enabling fingerprint login.");
    }

    await verifyNativeIdentity(biometricPlugin);
    await saveNativeSessionCredentials(biometricPlugin, user, session);
    localStorage.setItem(enabledKey(user.id), "true");
    saveLoginHint(user);
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
  localStorage.setItem(enabledKey(user.id), "true");
  saveLoginHint(user);
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
  clearLoginHint(userId);
};
