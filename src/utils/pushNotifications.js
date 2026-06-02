import { supabase } from "../supabaseClient";

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

export const setupPushNotifications = async (user) => {
  if (!user?.id) return { available: false, reason: "no_user" };

  const native = await getNativeContext();
  if (!native.available) return native;

  const { PushNotifications, platform } = native;

  try {
    let permissions = await PushNotifications.checkPermissions();
    if (permissions.receive === "prompt") {
      permissions = await PushNotifications.requestPermissions();
    }

    if (permissions.receive !== "granted") {
      return { available: true, granted: false, reason: "permission_denied" };
    }

    await PushNotifications.removeAllListeners();

    await PushNotifications.addListener("registration", async (token) => {
      if (!token?.value) return;

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

    await PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
      const conversationId = notification?.notification?.data?.conversation_id;
      if (conversationId) window.location.href = `/messages?conversation=${conversationId}`;
      else window.location.href = "/messages";
    });

    await PushNotifications.register();
    return { available: true, granted: true };
  } catch (error) {
    console.warn("Push notification setup failed:", error);
    return { available: true, granted: false, error: error.message || "setup_failed" };
  }
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
