import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { recipient_id, title, body, message_id, conversation_id } = await req.json();
    if (!recipient_id) throw new Error("recipient_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fcmServerKey = Deno.env.get("FCM_SERVER_KEY");

    if (!fcmServerKey) {
      return new Response(JSON.stringify({ sent: 0, skipped: true, reason: "FCM_SERVER_KEY not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: tokens, error } = await supabase
      .from("device_push_tokens")
      .select("token")
      .eq("user_id", recipient_id);

    if (error) throw error;
    if (!tokens?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: "no registered devices" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const responses = await Promise.all(tokens.map(({ token }) =>
      fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          "Authorization": `key=${fcmServerKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: token,
          notification: {
            title: title || "New VetLearn message",
            body: body || "You have a new VetLearn message."
          },
          data: {
            message_id: message_id || "",
            conversation_id: conversation_id || "",
            route: "/messages"
          }
        })
      })
    ));

    return new Response(JSON.stringify({ sent: responses.filter((response) => response.ok).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
