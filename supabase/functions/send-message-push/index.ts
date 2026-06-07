import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const fcmServerKey = Deno.env.get("FCM_SERVER_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Missing Supabase environment variables" }, 500);
    }

    if (!fcmServerKey) {
      return json({ sent: 0, skipped: true, reason: "FCM_SERVER_KEY not configured" });
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
    if (recipient_id === authData.user.id) return json({ sent: 0, skipped: true, reason: "self" });

    const { data: prefs } = await adminClient
      .from("user_preferences")
      .select("app_preferences")
      .eq("user_id", recipient_id)
      .maybeSingle();

    if (prefs?.app_preferences?.notifications === false) {
      return json({ sent: 0, skipped: true, reason: "recipient disabled notifications" });
    }

    const { data: tokens, error: tokenError } = await adminClient
      .from("device_push_tokens")
      .select("token")
      .eq("user_id", recipient_id);

    if (tokenError) return json({ error: tokenError.message }, 500);

    const uniqueTokens = [...new Set((tokens || []).map((row) => row.token).filter(Boolean))];
    if (uniqueTokens.length === 0) return json({ sent: 0, skipped: true, reason: "no registered devices" });

    const results = await Promise.allSettled(uniqueTokens.map((token) => sendFcm({
      token,
      fcmServerKey,
      title: title || "New VetLearn message",
      body: body || "You have a new VetLearn message.",
      data: {
        type: "message",
        message_id: message_id ? String(message_id) : "",
        conversation_id: conversation_id ? String(conversation_id) : "",
        route: "/messages"
      }
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
      sent: detail.filter((item) => item.ok).length,
      failed: failedTokens.length,
      attempted: uniqueTokens.length
    });
  } catch (error) {
    console.error("send-message-push failed", error);
    return json({ error: error?.message || String(error) }, 400);
  }
});

async function sendFcm({ token, fcmServerKey, title, body, data }: {
  token: string;
  fcmServerKey: string;
  title: string;
  body: string;
  data: Record<string, string>;
}) {
  const response = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Authorization": `key=${fcmServerKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to: token,
      priority: "high",
      notification: {
        title,
        body,
        sound: "default",
        channel_id: "vetlearn_messages"
      },
      data
    })
  });

  const responseBody = await response.json().catch(() => ({}));
  const resultError = responseBody?.results?.[0]?.error || responseBody?.error;

  if (!response.ok || responseBody?.failure > 0 || resultError) {
    throw new Error(resultError || `FCM failed with ${response.status}`);
  }

  return { ok: true };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
