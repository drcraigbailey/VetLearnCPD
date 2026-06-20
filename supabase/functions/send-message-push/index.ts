import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const fcmScope = "https://www.googleapis.com/auth/firebase.messaging";
const tokenUrl = "https://oauth2.googleapis.com/token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
    const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
    const firebasePrivateKey = normalisePrivateKey(Deno.env.get("FIREBASE_PRIVATE_KEY"));

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Missing Supabase environment variables" }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Not signed in" }, 401);

    const payload = await req.json();
    const {
      recipient_id,
      title,
      body,
      message_id,
      conversation_id,
      notification_type,
      type,
      route,
      admin_support_broadcast
    } = payload;

    let recipientIds = recipient_id ? [String(recipient_id)] : [];
    let messageId = message_id ? String(message_id) : null;
    let conversationId = conversation_id ? String(conversation_id) : null;
    let notificationType = String(notification_type || type || "message");
    let messageTitle = title || "New message";
    let messageBody = body || "You have a new VetLearn message.";
    let notificationRoute = route || (conversationId ? `/messages?conversation=${conversationId}` : "/messages");

    if (admin_support_broadcast) {
      const supportTarget = await resolveAdminSupportBroadcast(adminClient, {
        senderId: authData.user.id,
        messageId,
        conversationId
      });

      if (supportTarget.error) return json({ error: supportTarget.error }, supportTarget.status || 400);
      recipientIds = supportTarget.recipientIds;
      messageId = supportTarget.messageId || messageId;
      conversationId = supportTarget.conversationId || conversationId;
      notificationType = "admin_support_message";
      messageTitle = title || "New Admin message";
      messageBody = body || "A user sent Admin a message.";
      notificationRoute = route || `/admin?tab=mailbox${conversationId ? `&conversation=${conversationId}` : ""}`;
    }

    recipientIds = [...new Set(recipientIds.filter((id) => id && id !== authData.user.id))];
    if (recipientIds.length === 0) return json({ sent: 0, notification_created: false, skipped: true, reason: "no recipients" });

    let accessToken = "";
    let sent = 0;
    let failed = 0;
    let attempted = 0;
    let notificationCreated = false;
    const details: unknown[] = [];

    for (const recipientId of recipientIds) {
      const notificationResult = await createInAppNotification(adminClient, {
        recipientId,
        senderId: authData.user.id,
        title: messageTitle,
        body: messageBody,
        messageId,
        conversationId,
        notificationType,
        route: notificationRoute
      });
      notificationCreated = notificationCreated || Boolean(notificationResult.created || notificationResult.updated);

      const { data: prefs } = await adminClient
        .from("user_preferences")
        .select("app_preferences")
        .eq("user_id", recipientId)
        .maybeSingle();

      if (prefs?.app_preferences?.notifications === false) {
        details.push({ recipient_id: recipientId, sent: 0, skipped: true, reason: "recipient disabled phone notifications" });
        continue;
      }

      if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
        details.push({ recipient_id: recipientId, sent: 0, skipped: true, reason: "Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY secret" });
        continue;
      }

      const { data: tokens, error: tokenError } = await adminClient
        .from("device_push_tokens")
        .select("token")
        .eq("user_id", recipientId);

      if (tokenError) {
        details.push({ recipient_id: recipientId, error: tokenError.message });
        continue;
      }

      const uniqueTokens = [...new Set((tokens || []).map((row) => row.token).filter(Boolean))];
      if (uniqueTokens.length === 0) {
        details.push({ recipient_id: recipientId, sent: 0, skipped: true, reason: "no registered devices" });
        continue;
      }

      if (!accessToken) {
        accessToken = await getGoogleAccessToken({
          clientEmail: firebaseClientEmail,
          privateKey: firebasePrivateKey
        });
      }

      const messageData = {
        type: notificationType,
        message_id: messageId || "",
        conversation_id: conversationId || "",
        route: notificationRoute
      };

      const results = await Promise.allSettled(uniqueTokens.map((token) => sendFcmV1({
        token,
        accessToken,
        projectId: firebaseProjectId,
        title: messageTitle,
        body: messageBody,
        data: messageData
      })));

      const failedTokens: string[] = [];
      const successful = results.filter((result, index) => {
        if (result.status === "fulfilled") return true;
        failedTokens.push(uniqueTokens[index]);
        return false;
      }).length;

      if (failedTokens.length > 0) {
        await adminClient
          .from("device_push_tokens")
          .delete()
          .eq("user_id", recipientId)
          .in("token", failedTokens);
      }

      sent += successful;
      failed += failedTokens.length;
      attempted += uniqueTokens.length;
      details.push({ recipient_id: recipientId, sent: successful, failed: failedTokens.length, attempted: uniqueTokens.length });
    }

    return json({
      ok: true,
      notification_created: notificationCreated,
      sent,
      failed,
      attempted,
      recipients: recipientIds.length,
      details
    });
  } catch (error) {
    console.error("send-message-push failed", error);
    return json({ error: error?.message || String(error) }, 400);
  }
});

async function createInAppNotification(adminClient: ReturnType<typeof createClient>, details: {
  recipientId: string;
  senderId: string;
  title: string;
  body: string;
  messageId?: string | null;
  conversationId?: string | null;
  notificationType?: string;
  route?: string | null;
}) {
  const messageId = details.messageId ? String(details.messageId) : null;
  const conversationId = details.conversationId ? String(details.conversationId) : null;
  const notificationType = details.notificationType || "message";
  const route = details.route || (conversationId ? `/messages?conversation=${conversationId}` : "/messages");

  if (messageId) {
    const { data: message, error: messageError } = await adminClient
      .from("messages")
      .select("id, is_read")
      .eq("id", messageId)
      .maybeSingle();

    if (!messageError && message?.is_read) {
      return { created: false, skipped: true, reason: "message already read" };
    }
  }

  const payload = {
    user_id: details.recipientId,
    type: notificationType,
    title: details.title,
    message: details.body,
    related_id: messageId,
    metadata: {
      message_id: messageId,
      conversation_id: conversationId,
      sender_id: details.senderId,
      route
    },
    is_read: false,
    created_at: new Date().toISOString()
  };

  if (messageId) {
    const { data: existing } = await adminClient
      .from("notifications")
      .select("id")
      .eq("user_id", details.recipientId)
      .eq("type", notificationType)
      .eq("related_id", messageId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await adminClient
        .from("notifications")
        .update({
          title: payload.title,
          message: payload.message,
          metadata: payload.metadata,
          is_read: false,
          read_at: null,
          created_at: payload.created_at
        })
        .eq("id", existing.id);

      if (!error) return { created: false, updated: true };
      console.error("Could not update in-app notification", error);
    }
  }

  const { error } = await adminClient.from("notifications").insert(payload);
  if (!error) return { created: true, updated: false };

  console.error("Could not create in-app notification", error);

  const fallbackPayload = {
    user_id: details.recipientId,
    type: notificationType,
    message: details.body,
    related_id: messageId,
    is_read: false
  };

  const fallback = await adminClient.from("notifications").insert(fallbackPayload);
  if (fallback.error) {
    console.error("Could not create fallback in-app notification", fallback.error);
    return { created: false, error: fallback.error.message };
  }

  return { created: true };
}

async function resolveAdminSupportBroadcast(adminClient: ReturnType<typeof createClient>, details: {
  senderId: string;
  messageId?: string | null;
  conversationId?: string | null;
}) {
  if (!details.messageId) return { error: "message_id is required for Admin support pushes", status: 400, recipientIds: [] as string[] };

  const { data: message, error: messageError } = await adminClient
    .from("messages")
    .select("id, conversation_id, sender_id")
    .eq("id", details.messageId)
    .maybeSingle();

  if (messageError) return { error: messageError.message, status: 500, recipientIds: [] as string[] };
  if (!message) return { error: "Message not found", status: 404, recipientIds: [] as string[] };
  if (message.sender_id !== details.senderId) return { error: "Cannot push a message sent by another user", status: 403, recipientIds: [] as string[] };

  const conversationId = String(message.conversation_id || details.conversationId || "");
  const { data: statusRow, error: statusError } = await adminClient
    .from("admin_support_conversation_status")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (statusError) return { error: statusError.message, status: 500, recipientIds: [] as string[] };
  if (!statusRow) return { error: "Not an Admin support conversation", status: 403, recipientIds: [] as string[] };

  const { data: admins, error: adminError } = await adminClient
    .from("admin_user_roles")
    .select("user_id")
    .eq("is_active", true)
    .in("role", ["admin", "super_admin"]);

  if (adminError) return { error: adminError.message, status: 500, recipientIds: [] as string[] };

  return {
    recipientIds: [...new Set((admins || []).map((row) => String(row.user_id)).filter(Boolean))],
    messageId: String(message.id),
    conversationId
  };
}

async function sendFcmV1({ token, accessToken, projectId, title, body, data }: {
  token: string;
  accessToken: string;
  projectId: string;
  title: string;
  body: string;
  data: Record<string, string>;
}) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "vetlearn_messages",
            sound: "default"
          }
        }
      }
    })
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseBody?.error?.message || `FCM HTTP v1 failed with ${response.status}`);
  }

  return { ok: true };
}

async function getGoogleAccessToken({ clientEmail, privateKey }: { clientEmail: string; privateKey: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: fcmScope,
    aud: tokenUrl,
    exp: now + 3600,
    iat: now
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsignedJwt));
  const jwt = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || "Could not get Firebase access token");
  }

  return body.access_token;
}

async function importPrivateKey(privateKey: string) {
  const pem = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binary = atob(pem);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function normalisePrivateKey(value?: string | null) {
  if (!value) return "";
  return value.replace(/\\n/g, "\n");
}

function base64UrlEncode(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
