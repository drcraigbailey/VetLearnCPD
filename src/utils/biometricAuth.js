const credentialPrefix = "vetlearn-biometric-credential";
const enabledPrefix = "vetlearn-biometric-enabled";

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

export const isBiometricAvailable = async () => {
  if (!window.PublicKeyCredential || !navigator.credentials) return false;
  if (!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

export const isBiometricEnabled = (userId) => {
  return localStorage.getItem(enabledKey(userId)) === "true" && Boolean(localStorage.getItem(credentialKey(userId)));
};

export const registerBiometric = async (user) => {
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

export const disableBiometric = (userId) => {
  localStorage.removeItem(credentialKey(userId));
  localStorage.removeItem(enabledKey(userId));
};
