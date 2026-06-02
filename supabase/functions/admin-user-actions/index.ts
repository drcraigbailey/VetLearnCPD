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
  const adminClient = createClient(supabaseUrl, serviceKey);

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

  const { action, targetUserId, email } = await req.json();
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
      const { error } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (error) throw error;
      await audit(adminClient, authData.user.id, action, targetUserId, {});
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
    return json({ error: error.message || "Admin action failed" }, 500);
  }
});

async function audit(client, adminUserId, action, targetUserId, details) {
  await client.from("admin_audit_logs").insert({
    admin_user_id: adminUserId,
    action,
    target_user_id: targetUserId || null,
    details: details || {}
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
