import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "capacitor-native-biometric";

const localPrefix = "vetlearn-ai-api-key";
const serverPrefix = "vetlearn-ai-api-key";

const isNative = () => Capacitor?.isNativePlatform?.() === true;
const serverForUser = (userId) => `${serverPrefix}-${userId}`;
const localKeyForUser = (userId) => `${localPrefix}-${userId}`;

const nativePlugin = () => {
  if (!isNative()) return null;
  return NativeBiometric || null;
};

export const saveUserAiApiKey = async (userId, apiKey) => {
  const cleanKey = apiKey?.trim();
  if (!userId || !cleanKey) throw new Error("Enter an API key first.");

  const plugin = nativePlugin();
  if (plugin) {
    await plugin.setCredentials({
      username: "ai-api-key",
      password: cleanKey,
      server: serverForUser(userId)
    });
    return { secure: true };
  }

  localStorage.setItem(localKeyForUser(userId), cleanKey);
  return { secure: false };
};

export const getUserAiApiKey = async (userId) => {
  if (!userId) return "";

  const plugin = nativePlugin();
  if (plugin) {
    try {
      const credentials = await plugin.getCredentials({ server: serverForUser(userId) });
      return credentials?.password || "";
    } catch {
      return "";
    }
  }

  return localStorage.getItem(localKeyForUser(userId)) || "";
};

export const hasUserAiApiKey = async (userId) => Boolean(await getUserAiApiKey(userId));

export const removeUserAiApiKey = async (userId) => {
  if (!userId) return;

  const plugin = nativePlugin();
  if (plugin) {
    try {
      await plugin.deleteCredentials({ server: serverForUser(userId) });
    } catch {
      // Missing credentials are fine; make sure the local fallback is clear too.
    }
  }

  localStorage.removeItem(localKeyForUser(userId));
};

export const isAiApiKeyStoredSecurely = () => Boolean(nativePlugin());
