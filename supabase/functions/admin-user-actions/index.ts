import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Missing Supabase environment variables" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Not signed in" }, 401);

  const { data: role } = await adminClient
    .from("admin_user_roles")
    .select("role, is_active")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!role || !["admin", "super_admin"].includes(role.role)) {
    return json({ error: "Admin access required" }, 403);
  }

  let payload;
  try {
    payload = await req.json();
  } catch (_error) {
    return json({ error: "Invalid request body" }, 400);
  }

  const { action, targetUserId, email } = payload;
  if (!action) return json({ error: "Missing action" }, 400);

  try {
    if (action === "send_password_reset") {
      if (!email) return json({ error: "Missing email" }, 400);
      const redirectTo = Deno.env.get("PASSWORD_RESET_REDIRECT_URL") || undefined;
      const { error } = await adminClient.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      await audit(adminClient, authData.user.id, action, targetUserId, { email });
      return json({ ok: true });
    }

    if (action === "logout_user") {
      if (!targetUserId) return json({ error: "Missing targetUserId" }, 400);
      const { error } = await adminClient.auth.admin.signOut(targetUserId, "global");
      if (error) throw error;
      await audit(adminClient, authData.user.id, action, targetUserId, {});
      return json({ ok: true });
    }

    if (action === "delete_user") {
      if (role.role !== "super_admin") return json({ error: "Only Super Admins can delete users" }, 403);
      if (!targetUserId) return json({ error: "Missing targetUserId" }, 400);
      if (targetUserId === authData.user.id) return json({ error: "You cannot delete your own account from the admin dashboard" }, 400);

      await deleteUserData(adminClient, targetUserId);

      const { error } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (error) throw error;

      await audit(adminClient, authData.user.id, action, null, { deleted_user_id: targetUserId, email: email || null });
      return json({ ok: true });
    }

    if (action === "force_password_reset") {
      if (!targetUserId) return json({ error: "Missing targetUserId" }, 400);
      const { error } = await adminClient
        .from("user_account_status")
        .upsert({ user_id: targetUserId, status: "active", reason: "force_password_reset", updated_by: authData.user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      await audit(adminClient, authData.user.id, action, targetUserId, {});
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error?.message || "Admin action failed" }, 500);
  }
});

async function audit(client, adminUserId, action, targetUserId, details) {
  await client.from("admin_audit_logs").insert({
    admin_user_id: adminUserId,
    action,
    target_user_id: targetUserId || null,
    details: details || {}
  }).then(() => null);
}

async function deleteUserData(client, targetUserId) {
  const deleteByUserId = [
    "calculator_logs",
    "caselogs",
    "case_logs",
    "cpd_entries",
    "cpd_reading",
    "dashboard_favourites",
    "device_push_tokens",
    "file_upload_events",
    "notifications",
    "protocol_saves",
    "protocols",
    "recently_viewed",
    "site_activity_events",
    "user_feature_overrides",
    "user_preferences",
    "user_private_settings",
    "user_subscriptions",
    "vault_entries"
  ];

  for (const table of deleteByUserId) {
    await maybeDelete(client.from(table).delete().eq("user_id", targetUserId));
  }

  await maybeDelete(client.from("drugs").delete().eq("user_id", targetUserId));
  await maybeDelete(client.from("messages").delete().eq("sender_id", targetUserId));
  await maybeDelete(client.from("messages").delete().eq("recipient_id", targetUserId));
  await maybeDelete(client.from("conversations").delete().eq("user1_id", targetUserId));
  await maybeDelete(client.from("conversations").delete().eq("user2_id", targetUserId));
  await maybeDelete(client.from("connections").delete().eq("requester_id", targetUserId));
  await maybeDelete(client.from("connections").delete().eq("receiver_id", targetUserId));
  await maybeDelete(client.from("connections").delete().eq("user1_id", targetUserId));
  await maybeDelete(client.from("connections").delete().eq("user2_id", targetUserId));
  await maybeDelete(client.from("shared_records").delete().eq("sender_id", targetUserId));
  await maybeDelete(client.from("shared_records").delete().eq("recipient_id", targetUserId));

  await maybeUpdate(client.from("admin_audit_logs").update({ target_user_id: null }).eq("target_user_id", targetUserId));
  await maybeUpdate(client.from("admin_announcements").update({ created_by: null }).eq("created_by", targetUserId));
  await maybeUpdate(client.from("system_backups").update({ created_by: null }).eq("created_by", targetUserId));
  await maybeUpdate(client.from("system_error_logs").update({ user_id: null }).eq("user_id", targetUserId));
  await maybeUpdate(client.from("subscription_feature_access").update({ updated_by: null }).eq("updated_by", targetUserId));
  await maybeUpdate(client.from("user_account_status").update({ updated_by: null }).eq("updated_by", targetUserId));
  await maybeUpdate(client.from("user_subscriptions").update({ updated_by: null }).eq("updated_by", targetUserId));
  await maybeUpdate(client.from("profiles").update({ suspended_by: null }).eq("suspended_by", targetUserId));

  await maybeDelete(client.from("admin_user_roles").delete().eq("user_id", targetUserId));
  await maybeDelete(client.from("user_account_status").delete().eq("user_id", targetUserId));
  await maybeDelete(client.from("profiles").delete().eq("id", targetUserId));
}

async function maybeDelete(query) {
  const { error } = await query;
  if (isSafeToIgnoreSchemaError(error)) return;
  if (error) throw error;
}

async function maybeUpdate(query) {
  const { error } = await query;
  if (isSafeToIgnoreSchemaError(error) || isNotNullConstraintError(error)) return;
  if (error) throw error;
}

function isSafeToIgnoreSchemaError(error) {
  if (!error) return false;
  const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

function isNotNullConstraintError(error) {
  return error?.code === "23502";
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
