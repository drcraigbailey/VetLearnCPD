import { supabase } from "../supabaseClient";

let activeRegistrationUserId = null;
let setupPromise = null;
let listenersAttached = false;

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

const attachPushListeners = async (PushNotifications, user, platform) => {
  if (listenersAttached) return;

  await PushNotifications.removeAllListeners();

  await PushNotifications.addListener("registration", async (token) => {
    if (!token?.value) {
      console.warn("Push registration returned no token");
      return;
    }

    logPush("FCM token registered", token.value);

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
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
    const conversationId = notification?.notification?.data?.conversation_id;
    if (conversationId) window.location.href = `/messages?conversation=${conversationId}`;
    else window.location.href = "/messages";
  });

  listenersAttached = true;
};

const runPushSetup = async (user) => {
  if (!user?.id) return { available: false, reason: "no_user" };

  const native = await getNativeContext();
  if (!native.available) return native;

  const { PushNotifications, platform } = native;

  try {
    logPush("Checking notification permission");
    let permissions = await PushNotifications.checkPermissions();

    if (permissions.receive === "prompt") {
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

export const setupPushNotifications = async (user) => {
  if (!user?.id) return { available: false, reason: "no_user" };
  if (activeRegistrationUserId === user.id && setupPromise) return setupPromise;

  setupPromise = runPushSetup(user);
  return setupPromise;
};

export const sendMessagePushNotification = async ({ recipientId, title, body, messageId, conversationId }) => {
  if (!recipientId) return;

  try {
    const { error } = await supabase.functions.invoke("send-message-push", {
      body: {
        recipient_id: recipientId,
        title: title || "New VetLearn message",
        body: body || "You have a new VetLearn message.",
        message_id: messageId ? String(messageId) : null,
        conversation_id: conversationId ? String(conversationId) : null
      }
    });

    if (error) console.warn("Phone push notification was not sent:", error.message);
  } catch (error) {
    console.warn("Phone push notification fallback used:", error.message || error);
  }
};
