import { Capacitor } from "@capacitor/core";
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

const loadNativeBiometric = async () => {
  if (!isNative()) return null;

  const packageNames = [
    "capacitor-native-biometric",
    "@capgo/capacitor-native-biometric"
  ];

  for (const packageName of packageNames) {
    try {
      const module = await import(packageName);
      if (module?.NativeBiometric) return module.NativeBiometric;
    } catch {
      // Try the next known package name, then fall back to web passkeys.
    }
  }

  return null;
};

const verifyNativeIdentity = async (NativeBiometric) => {
  await NativeBiometric.verifyIdentity({
    reason: "Unlock VetLearn",
    title: "Unlock VetLearn",
    subtitle: "Confirm it is you",
    description: "Use fingerprint, Face ID or your device screen lock to continue."
  });
  return true;
};

const getNativeCredentials = async (NativeBiometric) => {
  const credentials = await NativeBiometric.getCredentials({ server: nativeServer });
  if (!credentials?.password) throw new Error("Fingerprint login is not set up on this phone.");

  try {
    return JSON.parse(credentials.password);
  } catch {
    throw new Error("Please turn fingerprint login off and on again in Settings.");
  }
};

export const isBiometricAvailable = async () => {
  const NativeBiometric = await loadNativeBiometric();
  if (NativeBiometric) {
    try {
      const result = await NativeBiometric.isAvailable();
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

export const registerBiometric = async (user) => {
  const NativeBiometric = await loadNativeBiometric();
  if (NativeBiometric) {
    const result = await NativeBiometric.isAvailable();
    if (!result?.isAvailable) throw new Error("Fingerprint or Face ID is not available on this device.");

    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.access_token || !session?.refresh_token) {
      throw new Error("Please sign in again before enabling fingerprint login.");
    }

    await verifyNativeIdentity(NativeBiometric);
    await NativeBiometric.setCredentials({
      username: user.email || user.id,
      password: JSON.stringify({
        user_id: user.id,
        email: user.email || "",
        access_token: session.access_token,
        refresh_token: session.refresh_token
      }),
      server: nativeServer
    });
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
  const NativeBiometric = await loadNativeBiometric();
  if (NativeBiometric) {
    const result = await NativeBiometric.isAvailable();
    if (!result?.isAvailable) throw new Error("Fingerprint or Face ID is not available on this device.");

    await verifyNativeIdentity(NativeBiometric);
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
  const NativeBiometric = await loadNativeBiometric();
  if (NativeBiometric) {
    const result = await NativeBiometric.isAvailable();
    if (!result?.isAvailable) throw new Error("Fingerprint or Face ID is not available on this device.");

    await verifyNativeIdentity(NativeBiometric);
    const credentials = await getNativeCredentials(NativeBiometric);
    if (!credentials?.access_token || !credentials?.refresh_token) {
      throw new Error("Please turn fingerprint login off and on again in Settings.");
    }

    const { error } = await supabase.auth.setSession({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token
    });

    if (error) throw error;
    return true;
  }

  const savedUser = getLastBiometricUser();
  if (!savedUser?.id || !isBiometricEnabled(savedUser.id)) {
    throw new Error("Fingerprint login is not set up on this device.");
  }

  await authenticateBiometric(savedUser);
  const { error } = await supabase.auth.signInWithPasskey();
  if (error) throw error;
  return true;
};

export const disableBiometric = async (userId) => {
  const NativeBiometric = await loadNativeBiometric();
  if (NativeBiometric) {
    try {
      await NativeBiometric.deleteCredentials({ server: nativeServer });
    } catch {
      // Local setting still needs clearing if native credentials are already gone.
    }
  }

  localStorage.removeItem(credentialKey(userId));
  localStorage.removeItem(enabledKey(userId));
  clearLoginHint(userId);
};
