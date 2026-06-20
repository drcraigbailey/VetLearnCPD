import { supabase } from "../supabaseClient";

let activeRegistrationUserId = null;
let setupPromise = null;
let listenerUserId = null;
let settingsListenerUserId = null;
let lastPushContext = null;
const PUSH_NAVIGATION_KEY = "vetlearn-last-push-navigation-at";
const PUSH_NAVIGATION_TTL_MS = 15000;
const NORMAL_LAUNCH_REDIRECT_SEEN_KEY = "vetlearn-normal-launch-redirect-seen";

const logPush = (...parts) => console.log("[VetLearn Push]", ...parts);

const isPushUnavailableError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("cannot find") || message.includes("failed to resolve") || message.includes("not implemented");
};

const getNativeContext = async () => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform?.()) return { available: false, reason: "web" };

    const { PushNotifications } = await import("@capacitor/push-notifications");
    return {
      available: true,
      PushNotifications,
      platform: Capacitor.getPlatform?.() || "native"
    };
  } catch (error) {
    if (!isPushUnavailableError(error)) console.warn("Push notification plugin unavailable:", error);
    return { available: false, reason: "plugin_missing", error };
  }
};

const ensureAndroidChannel = async (PushNotifications, platform) => {
  if (platform !== "android" || !PushNotifications.createChannel) return;

  try {
    await PushNotifications.createChannel({
      id: "vetlearn_messages",
      name: "VetLearn messages",
      description: "VetLearn message and activity notifications",
      importance: 4,
      visibility: 1,
      lights: true,
      vibration: true
    });
    logPush("Android notification channel ready");
  } catch (error) {
    console.warn("Could not create Android notification channel:", error?.message || error);
  }
};

const isPromptState = (receive) => String(receive || "").startsWith("prompt");

export const markPushNavigationIntent = () => {
  if (typeof window === "undefined") return;
  const timestamp = String(Date.now());
  try {
    window.sessionStorage?.setItem(PUSH_NAVIGATION_KEY, timestamp);
    window.localStorage?.setItem(PUSH_NAVIGATION_KEY, timestamp);
    window.sessionStorage?.setItem(NORMAL_LAUNCH_REDIRECT_SEEN_KEY, "1");
  } catch (error) {
    console.warn("Could not mark push navigation intent:", error?.message || error);
  }
};

export const hasRecentPushNavigationIntent = () => {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage?.getItem(PUSH_NAVIGATION_KEY) || window.localStorage?.getItem(PUSH_NAVIGATION_KEY);
    const timestamp = Number(raw || 0);
    const hasRecentPushIntent = Number.isFinite(timestamp) && Date.now() - timestamp < PUSH_NAVIGATION_TTL_MS;

    if (hasRecentPushIntent) {
      window.sessionStorage?.setItem(NORMAL_LAUNCH_REDIRECT_SEEN_KEY, "1");
      return true;
    }

    // NativeLaunchHomeRedirect also uses this as a safety gate before sending the app home.
    // Let the first cold launch redirect to Dashboard, then suppress later resume redirects.
    if (window.sessionStorage?.getItem(NORMAL_LAUNCH_REDIRECT_SEEN_KEY) === "1") return true;
    window.sessionStorage?.setItem(NORMAL_LAUNCH_REDIRECT_SEEN_KEY, "1");
    return false;
  } catch {
    return false;
  }
};

const routeWithPushMarker = (route) => {
  const fallback = "/messages";
  try {
    const url = new URL(route || fallback, window.location.origin);
    url.searchParams.set("fromPush", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
};

const getPushRoute = (data = {}) => {
  if (data.route) return String(data.route);
  if (data.conversation_id) return `/messages?conversation=${encodeURIComponent(String(data.conversation_id))}`;
  if (data.type === "admin_support_message" || data.type === "admin_group_message") return "/admin?tab=mailbox";
  return "/messages";
};

const openPushRoute = (data = {}) => {
  const route = routeWithPushMarker(getPushRoute(data));
  markPushNavigationIntent();
  window.location.href = route;
};

export const getPushNotificationPreference = async (userId) => {
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("app_preferences")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("Could not read notification preference:", error.message);
      return false;
    }

    return data?.app_preferences?.notifications === true;
  } catch (error) {
    console.warn("Could not read notification preference:", error?.message || error);
    return false;
  }
};

const attachPushListeners = async (PushNotifications, user, platform) => {
  if (listenerUserId === user.id) return;

  try {
    await PushNotifications.removeAllListeners();
  } catch (error) {
    console.warn("Could not reset push listeners:", error?.message || error);
  }

  listenerUserId = user.id;

  await PushNotifications.addListener("registration", async (token) => {
    if (!token?.value) {
      console.warn("Push registration returned no token");
      return;
    }

    logPush("FCM token registered", token.value);

    await supabase
      .from("device_push_tokens")
      .delete()
      .eq("token", token.value)
      .neq("user_id", user.id);

    const { error } = await supabase.from("device_push_tokens").upsert(
      {
        user_id: user.id,
        token: token.value,
        platform,
        provider: "capacitor",
        last_seen_at: new Date().toISOString()
      },
      { onConflict: "user_id,token" }
    );

    if (error) console.warn("Could not save push token:", error.message);
  });

  await PushNotifications.addListener("registrationError", (error) => {
    console.warn("Push registration failed:", error);
  });

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    logPush("Foreground notification received", notification?.title || notification?.data);
    window.dispatchEvent(new Event("notificationsUpdated"));
    window.dispatchEvent(new Event("messagesUpdated"));
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
    openPushRoute(notification?.notification?.data || {});
  });
};

export const disablePushNotifications = async (userId) => {
  setupPromise = null;
  activeRegistrationUserId = null;
  listenerUserId = null;

  try {
    const native = await getNativeContext();
    if (native.available) await native.PushNotifications.removeAllListeners();
  } catch (error) {
    console.warn("Could not remove push listeners:", error?.message || error);
  }

  if (userId) {
    try {
      const { error } = await supabase.from("device_push_tokens").delete().eq("user_id", userId);
      if (error) console.warn("Could not remove push tokens:", error.message);
    } catch (error) {
      console.warn("Could not remove push tokens:", error?.message || error);
    }
  }

  logPush("Phone notifications disabled");
  return { available: true, granted: false, reason: "disabled" };
};

const ensureSettingsListener = (user) => {
  if (!user?.id || settingsListenerUserId === user.id || typeof window === "undefined") return;
  settingsListenerUserId = user.id;

  window.addEventListener("settingsUpdated", async () => {
    setupPromise = null;
    activeRegistrationUserId = null;

    const enabled = await getPushNotificationPreference(user.id);
    if (!enabled) {
      await disablePushNotifications(user.id);
      return;
    }

    await setupPushNotifications(user, { force: true });
  });
};

const runPushSetup = async (user) => {
  if (!user?.id) return { available: false, reason: "no_user" };

  const enabled = await getPushNotificationPreference(user.id);
  if (!enabled) {
    await disablePushNotifications(user.id);
    return { available: true, granted: false, reason: "disabled" };
  }

  const native = await getNativeContext();
  if (!native.available) return native;

  const { PushNotifications, platform } = native;
  lastPushContext = native;

  try {
    logPush("Checking notification permission");
    let permissions = await PushNotifications.checkPermissions();

    if (isPromptState(permissions.receive)) {
      logPush("Requesting notification permission");
      permissions = await PushNotifications.requestPermissions();
    }

    if (permissions.receive !== "granted") {
      logPush("Notification permission denied");
      return { available: true, granted: false, reason: "permission_denied" };
    }

    await ensureAndroidChannel(PushNotifications, platform);
    await attachPushListeners(PushNotifications, user, platform);

    logPush("Registering device for push notifications");
    await PushNotifications.register();
    activeRegistrationUserId = user.id;
    return { available: true, granted: true };
  } catch (error) {
    console.warn("Push notification setup failed:", error);
    activeRegistrationUserId = null;
    setupPromise = null;
    return { available: true, granted: false, error: error.message || "setup_failed" };
  }
};

export const setupPushNotifications = async (user, options = {}) => {
  if (!user?.id) return { available: false, reason: "no_user" };
  ensureSettingsListener(user);

  if (!options.force && activeRegistrationUserId === user.id && setupPromise) return setupPromise;

  setupPromise = runPushSetup(user);
  return setupPromise;
};

export const getLastPushContext = () => lastPushContext;

export const sendMessagePushNotification = async ({ recipientId, title, body, messageId, conversationId, route, type = "message" }) => {
  if (!recipientId) return;

  try {
    const { error } = await supabase.functions.invoke("send-message-push", {
      body: {
        recipient_id: recipientId,
        notification_type: type,
        title: title || "New VetLearn message",
        body: body || "You have a new VetLearn message.",
        message_id: messageId ? String(messageId) : null,
        conversation_id: conversationId ? String(conversationId) : null,
        route: route || (conversationId ? `/messages?conversation=${conversationId}` : "/messages")
      }
    });

    if (error) console.warn("Phone push notification was not sent:", error.message);
  } catch (error) {
    console.warn("Phone push notification fallback used:", error.message || error);
  }
};

export const sendAdminSupportPushNotification = async ({ title, body, messageId, conversationId }) => {
  try {
    const { error } = await supabase.functions.invoke("send-message-push", {
      body: {
        admin_support_broadcast: true,
        notification_type: "admin_support_message",
        title: title || "New Admin message",
        body: body || "A user sent Admin a message.",
        message_id: messageId ? String(messageId) : null,
        conversation_id: conversationId ? String(conversationId) : null,
        route: conversationId ? `/admin?tab=mailbox&conversation=${conversationId}` : "/admin?tab=mailbox"
      }
    });

    if (error) console.warn("Admin support phone push was not sent:", error.message);
  } catch (error) {
    console.warn("Admin support phone push fallback used:", error.message || error);
  }
};
