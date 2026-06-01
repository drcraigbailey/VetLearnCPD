import { Capacitor } from "@capacitor/core";

const credentialPrefix = "vetlearn-biometric-credential";
const enabledPrefix = "vetlearn-biometric-enabled";
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

const loadNativeBiometric = async () => {
  if (!isNative()) return null;

  const packageNames = [
    "@capgo/capacitor-native-biometric",
    "capacitor-native-biometric"
  ];

  for (const packageName of packageNames) {
    try {
      const module = await import(/* @vite-ignore */ packageName);
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

export const isBiometricEnabled = (userId) => {
  if (isNative()) return localStorage.getItem(enabledKey(userId)) === "true";
  return localStorage.getItem(enabledKey(userId)) === "true" && Boolean(localStorage.getItem(credentialKey(userId)));
};

export const registerBiometric = async (user) => {
  const NativeBiometric = await loadNativeBiometric();
  if (NativeBiometric) {
    const result = await NativeBiometric.isAvailable();
    if (!result?.isAvailable) throw new Error("Fingerprint or Face ID is not available on this device.");

    await verifyNativeIdentity(NativeBiometric);
    await NativeBiometric.setCredentials({
      username: user.email || user.id,
      password: user.id,
      server: nativeServer
    });
    localStorage.setItem(enabledKey(user.id), "true");
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
};
