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

    const { recipient_id, title, body, message_id, conversation_id } = await req.json();
    if (!recipient_id) return json({ error: "recipient_id is required" }, 400);
    if (recipient_id === authData.user.id) return json({ sent: 0, notification_created: false, skipped: true, reason: "self" });

    const messageTitle = title || "New message";
    const messageBody = body || "You have a new VetLearn message.";

    const notificationResult = await createInAppNotification(adminClient, {
      recipientId: recipient_id,
      senderId: authData.user.id,
      title: messageTitle,
      body: messageBody,
      messageId: message_id,
      conversationId: conversation_id
    });

    const { data: prefs } = await adminClient
      .from("user_preferences")
      .select("app_preferences")
      .eq("user_id", recipient_id)
      .maybeSingle();

    if (prefs?.app_preferences?.notifications === false) {
      return json({ sent: 0, notification_created: notificationResult.created, skipped: true, reason: "recipient disabled phone notifications" });
    }

    if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
      return json({
        sent: 0,
        notification_created: notificationResult.created,
        skipped: true,
        reason: "Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY secret"
      });
    }

    const { data: tokens, error: tokenError } = await adminClient
      .from("device_push_tokens")
      .select("token")
      .eq("user_id", recipient_id);

    if (tokenError) return json({ error: tokenError.message, notification_created: notificationResult.created }, 500);

    const uniqueTokens = [...new Set((tokens || []).map((row) => row.token).filter(Boolean))];
    if (uniqueTokens.length === 0) {
      return json({ sent: 0, notification_created: notificationResult.created, skipped: true, reason: "no registered devices" });
    }

    const accessToken = await getGoogleAccessToken({
      clientEmail: firebaseClientEmail,
      privateKey: firebasePrivateKey
    });

    const messageData = {
      type: "message",
      message_id: message_id ? String(message_id) : "",
      conversation_id: conversation_id ? String(conversation_id) : "",
      route: "/messages"
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
    const detail = results.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      failedTokens.push(uniqueTokens[index]);
      return { ok: false, error: result.reason?.message || String(result.reason) };
    });

    if (failedTokens.length > 0) {
      await adminClient
        .from("device_push_tokens")
        .delete()
        .eq("user_id", recipient_id)
        .in("token", failedTokens);
    }

    return json({
      ok: true,
      notification_created: notificationResult.created,
      sent: detail.filter((item) => item.ok).length,
      failed: failedTokens.length,
      attempted: uniqueTokens.length
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
}) {
  const messageId = details.messageId ? String(details.messageId) : null;
  const payload = {
    user_id: details.recipientId,
    type: "message",
    title: details.title,
    message: details.body,
    sender_id: details.senderId,
    related_record_id: messageId,
    related_id: messageId,
    is_read: false,
    created_at: new Date().toISOString()
  };

  const { error } = await adminClient.from("notifications").insert(payload);
  if (!error) return { created: true };

  console.error("Could not create in-app notification", error);

  const fallbackPayload = {
    user_id: details.recipientId,
    type: "message",
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
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
