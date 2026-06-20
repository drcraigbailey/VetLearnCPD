import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  Crown,
  Database,
  Download,
  Flag,
  Inbox,
  FileText,
  Lock,
  Mail,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Reply,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
  Image as ImageIcon
} from "lucide-react";
import toast from "react-hot-toast";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AdminActivityExplorer from "../components/AdminActivityExplorer";
import LoadingState from "../components/LoadingState";
import PageBanner from "../components/PageBanner";
import AppPopup, { popupPresets } from "../components/AppPopup";
import { supabase } from "../supabaseClient";
import { sendMessagePushNotification } from "../utils/pushNotifications";

const adminTabs = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "users", label: "Users", icon: Users },
  { id: "permissions", label: "Permissions", icon: ShieldCheck },
  { id: "features", label: "Features", icon: Flag },
  { id: "subscriptions", label: "Subscriptions", icon: Crown },
  { id: "messages", label: "Admin Emails", icon: Mail },
  { id: "mailbox", label: "Mailbox", icon: Inbox },
  { id: "audit", label: "Site Analytics", icon: Lock },
  { id: "settings", label: "Settings", icon: Settings }
];

const ADMIN_ALERT_TYPES = ["admin_new_signup", "admin_support_message", "admin_group_message"];
const ADMIN_USER_ALERT_TYPES = ["admin_new_signup"];
const ADMIN_MAILBOX_ALERT_TYPES = ["admin_support_message", "admin_group_message"];

const featureLabels = {
  clinical_tools: "Clinical Tools",
  drug_calculator: "Drug Calculator",
  additional_calculators: "Additional Calculators",
  clinical_protocols: "Clinical Protocols",
  drug_database: "Drug Database",
  exotics_formulary: "Exotics Formulary",
  my_drugs: "My Drugs / My Monographs",
  library: "Library",
  case_logs: "Case Logs",
  network: "Network",
  messaging: "Messaging",
  cpd_tracker: "CPD Tracker",
  vault: "Vault",
  ai_assistant: "AI Assistant",
  pill_counter: "Pill Count"
};

const userTypeOptions = ["free", "clinician", "professional", "premium", "admin", "super_admin"];
const internalAdminTypes = ["admin", "super_admin"];
const userTypeLabels = {
  free: "Free",
  clinician: "Clinician",
  professional: "Professional",
  premium: "Premium",
  admin: "Admin",
  super_admin: "Super Admin"
};

const MESSAGE_ATTACHMENT_BUCKET = "message-attachments";

const normaliseAttachments = (attachments) => (Array.isArray(attachments) ? attachments : []);

const formatFileSize = (size) => {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

function AdminMessageAttachmentList({ attachments, darkMode }) {
  const cleanAttachments = normaliseAttachments(attachments);
  const [signedUrls, setSignedUrls] = useState({});

  useEffect(() => {
    let cancelled = false;
    const paths = cleanAttachments.map(item => item.path).filter(Boolean);
    if (!paths.length) {
      setSignedUrls({});
      return;
    }

    supabase.storage
      .from(MESSAGE_ATTACHMENT_BUCKET)
      .createSignedUrls(paths, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const urls = {};
        (data || []).forEach(item => {
          if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
        });
        setSignedUrls(urls);
      });

    return () => {
      cancelled = true;
    };
  }, [JSON.stringify(cleanAttachments.map(item => item.path || item.name))]);

  if (!cleanAttachments.length) return null;

  return (
    <div className="mt-2 space-y-2">
      {cleanAttachments.map((attachment, index) => {
        const signedUrl = attachment.path ? signedUrls[attachment.path] : null;
        const isImage = attachment.type?.startsWith("image/");
        const label = attachment.name || "Attachment";
        return (
          <a
            key={`${attachment.path || label}-${index}`}
            href={signedUrl || undefined}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-3 rounded-lg border p-2 text-xs font-bold transition ${darkMode ? "border-white/10 bg-white/10 text-white hover:bg-white/15" : "border-[#DCEDEA] bg-[#F0F6F5] text-[#113247] hover:bg-white"}`}
          >
            {isImage && signedUrl ? (
              <img src={signedUrl} alt="" className="h-12 w-12 rounded-md object-cover" />
            ) : (
              <span className={`grid h-12 w-12 place-items-center rounded-md ${darkMode ? "bg-black/20" : "bg-white"}`}>
                {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{label}</span>
              {attachment.size ? <span className="block text-[10px] font-semibold opacity-55">{formatFileSize(attachment.size)}</span> : null}
            </span>
          </a>
        );
      })}
    </div>
  );
}

const normaliseAdminTab = (tab) => adminTabs.some(item => item.id === tab) ? tab : "overview";

export default function AdminDashboard({ user, darkMode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(normaliseAdminTab(searchParams.get("tab")));
  const [loading, setLoading] = useState(true);
  const [adminRole, setAdminRole] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [appFeatures, setAppFeatures] = useState([]);
  const [featureMatrix, setFeatureMatrix] = useState([]);
  const [subscriptionFeatureMatrix, setSubscriptionFeatureMatrix] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [adminMessages, setAdminMessages] = useState([]);
  const [adminAlerts, setAdminAlerts] = useState([]);
  const [supportThreads, setSupportThreads] = useState([]);
  const [selectedSupportThread, setSelectedSupportThread] = useState(null);
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportFilter, setSupportFilter] = useState("all");
  const [supportReply, setSupportReply] = useState("");
  const [supportReplyAttachments, setSupportReplyAttachments] = useState([]);
  const [supportThreadToDelete, setSupportThreadToDelete] = useState(null);
  const [supportComposeOpen, setSupportComposeOpen] = useState(false);
  const [supportComposeQuery, setSupportComposeQuery] = useState("");
  const [supportComposeRecipientIds, setSupportComposeRecipientIds] = useState([]);
  const [supportComposeBody, setSupportComposeBody] = useState("");
  const [supportComposeAttachments, setSupportComposeAttachments] = useState([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState({ title: "", body: "", audience: "all" });
  const [working, setWorking] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [usersError, setUsersError] = useState("");

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  const markAdminAlertsRead = async (types) => {
    const unreadIds = adminAlerts
      .filter(item => types.includes(item.type))
      .map(item => item.id);

    if (unreadIds.length === 0) return;

    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: readAt })
      .eq("user_id", user.id)
      .in("id", unreadIds);

    if (!error) {
      setAdminAlerts(prev => prev.filter(item => !unreadIds.includes(item.id)));
      window.dispatchEvent(new Event("notificationsUpdated"));
    }
  };

  const selectAdminTab = (tabId) => {
    setActiveTab(tabId);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("tab", tabId);
      if (tabId !== "mailbox") next.delete("conversation");
      return next;
    }, { replace: true });
    if (tabId === "users") markAdminAlertsRead(ADMIN_USER_ALERT_TYPES);
    if (tabId === "mailbox") markAdminAlertsRead(ADMIN_MAILBOX_ALERT_TYPES);
  };

  const loadAdminData = async () => {
    setLoading(true);
    setStatsError("");
    setUsersError("");

    const roleRes = await supabase
      .from("admin_user_roles")
      .select("role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (roleRes.error) {
      console.error("Admin role lookup failed", roleRes.error);
    }

    if (roleRes.error || !roleRes.data || !["admin", "super_admin"].includes(roleRes.data.role)) {
      setAdminRole(null);
      setLoading(false);
      return;
    }

    setAdminRole(roleRes.data.role);

    const [statsRes, usersRes, subRes, adminMessagesRes, featuresRes, subFeatureRes, supportThreadsRes, adminAlertsRes] = await Promise.all([
      supabase.rpc("admin_dashboard_stats"),
      supabase.from("admin_user_overview").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("subscription_plans").select("*").order("sort_order", { ascending: true }),
      supabase
        .from("notifications")
        .select("id, title, message, type, is_read, created_at, related_id")
        .eq("type", "admin_announcement")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("app_features").select("*").order("name", { ascending: true }),
      supabase.from("subscription_feature_access").select("*").order("subscription_tier", { ascending: true }),
      supabase.from("admin_support_mailbox").select("*").order("last_message_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("notifications")
        .select("id, type, related_id, metadata, is_read, created_at")
        .eq("user_id", user.id)
        .eq("is_read", false)
        .in("type", ADMIN_ALERT_TYPES)
    ]);

    const featureRes = await supabase
      .from("user_type_feature_access")
      .select("*")
      .order("user_type", { ascending: true });

    if (statsRes.error) {
      console.error("Admin overview stats failed to load", statsRes.error);
      setStats(null);
      setStatsError(getStatsErrorMessage(statsRes.error));
    } else {
      setStats(normaliseAdminStats(statsRes.data));
    }

    if (usersRes.error) {
      console.error("Admin users failed to load", usersRes.error);
      setUsers([]);
      setUsersError(getUsersErrorMessage(usersRes.error));
    } else {
      setUsers(usersRes.data || []);
    }

    if (!adminMessagesRes.error) setAdminMessages(groupAdminMessages(adminMessagesRes.data || []));
    else {
      console.error("Admin messages failed to load", adminMessagesRes.error);
      setAdminMessages([]);
    }
    if (!featureRes.error) {
      setFeatureMatrix(featureRes.data || []);
    } else {
      setFeatureMatrix((subFeatureRes.data || []).map(item => ({
        user_type: item.subscription_tier,
        feature_key: item.feature_key,
        is_enabled: item.is_enabled,
        updated_at: item.updated_at,
        updated_by: item.updated_by
      })));
    }
    if (!subRes.error) setSubscriptions(subRes.data || []);
    else console.error("Admin subscriptions failed to load", subRes.error);
    if (!featuresRes.error) setAppFeatures(featuresRes.data || []);
    else console.error("Admin features failed to load", featuresRes.error);
    if (!subFeatureRes.error) setSubscriptionFeatureMatrix(subFeatureRes.data || []);
    else console.error("Subscription feature access failed to load", subFeatureRes.error);
    if (!supportThreadsRes.error) {
      const threads = supportThreadsRes.data || [];
      setSupportThreads(threads);
      const conversationParam = searchParams.get("conversation");
      if (conversationParam) {
        const selected = threads.find(item => String(item.conversation_id) === String(conversationParam));
        if (selected) selectSupportThread(selected);
      }
    } else {
      console.error("Admin support mailbox failed to load", supportThreadsRes.error);
      setSupportThreads([]);
    }
    if (!adminAlertsRes.error) setAdminAlerts(adminAlertsRes.data || []);
    else {
      console.error("Admin alerts failed to load", adminAlertsRes.error);
      setAdminAlerts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user?.id) return;
    // Loading remote admin data is the external synchronization performed here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAdminData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && adminTabs.some(item => item.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!adminRole) return;
    if (activeTab === "users") markAdminAlertsRead(ADMIN_USER_ALERT_TYPES);
    if (activeTab === "mailbox") markAdminAlertsRead(ADMIN_MAILBOX_ALERT_TYPES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, adminRole]);

  const adminAlertCounts = useMemo(() => ({
    users: adminAlerts.filter(item => ADMIN_USER_ALERT_TYPES.includes(item.type)).length,
    mailbox: adminAlerts.filter(item => ADMIN_MAILBOX_ALERT_TYPES.includes(item.type)).length,
    total: adminAlerts.length
  }), [adminAlerts]);

  const getAdminTabBadgeCount = (tabId) => {
    if (tabId === "users") return adminAlertCounts.users;
    if (tabId === "mailbox") return adminAlertCounts.mailbox;
    return 0;
  };

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(item =>
      [item.full_name, item.email, getUserType(item), item.role, item.subscription_tier, item.account_status, getMarketingOptInStatus(item).label]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    );
  }, [query, users]);

  const filteredSupportThreads = useMemo(() => {
    return supportThreads.filter(thread => {
      if (supportFilter === "unread") return Number(thread.unread_count || 0) > 0;
      if (supportFilter === "resolved") return thread.status === "resolved" || thread.status === "closed";
      if (supportFilter === "open") return !["resolved", "closed"].includes(thread.status);
      return true;
    });
  }, [supportFilter, supportThreads]);

  const isSuperAdmin = adminRole === "super_admin";

  const loadUsersForExport = async () => {
    const pageSize = 1000;
    const rows = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("admin_user_overview")
        .select("*")
        .order("email", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("Admin email export failed", error);
        toast.error(error.message || "Could not load email export");
        return null;
      }

      const page = data || [];
      rows.push(...page);

      if (page.length < pageSize) break;
    }

    return rows;
  };

  const exportEmailList = async (scope) => {
    setWorking(true);
    const exportUsers = await loadUsersForExport();

    if (!exportUsers) {
      setWorking(false);
      return;
    }

    const hasMarketingColumn = exportUsers.length === 0 || exportUsers.some(item => Object.prototype.hasOwnProperty.call(item, "marketing_emails_opt_in"));
    if (scope === "marketing" && !hasMarketingColumn) {
      toast.error("Run supabase/admin_email_marketing_exports.sql to expose marketing opt-ins in Admin.");
      setWorking(false);
      return;
    }

    const rows = exportUsers
      .filter(item => item.email)
      .filter(item => scope !== "marketing" || getMarketingOptInStatus(item).value === true)
      .map(item => ({
        email: item.email || "",
        full_name: item.full_name || "",
        marketing_emails_opt_in: getMarketingOptInStatus(item).value === true ? "yes" : getMarketingOptInStatus(item).value === false ? "no" : "unknown",
        marketing_emails_opt_in_at: item.marketing_emails_opt_in_at || "",
        user_type: getUserType(item),
        account_status: item.account_status || "active",
        created_at: item.created_at || ""
      }));

    if (rows.length === 0) {
      toast.error(scope === "marketing" ? "No marketing opt-ins found to export" : "No emails found to export");
      setWorking(false);
      return;
    }

    const filename = `vetlearn-${scope === "marketing" ? "marketing-opt-ins" : "all-emails"}-${new Date().toISOString().slice(0, 10)}.csv`;
    await exportCsvFile(filename, rows);
    await audit("email_list_exported", null, { scope, count: rows.length });
    toast.success(`Exported ${rows.length} email${rows.length === 1 ? "" : "s"}`);
    setWorking(false);
  };

  const audit = async (action, targetUserId = null, details = {}) => {
    await supabase.from("admin_audit_logs").insert({
      admin_user_id: user.id,
      action,
      target_user_id: targetUserId,
      details
    });
  };

  const updateUserStatus = async (targetUser, status) => {
    setWorking(true);
    let { error } = await supabase.rpc("admin_set_user_status", {
      target_user_id: targetUser.user_id,
      new_status: status,
      reason: status === "suspended" ? "Suspended from admin dashboard" : "Reactivated from admin dashboard"
    });

    if (isMissingRpcError(error)) {
      const fallback = await supabase
        .from("user_account_status")
        .upsert({ user_id: targetUser.user_id, status, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      error = fallback.error;
      if (!error) await audit(`user_${status}`, targetUser.user_id, { email: targetUser.email });
    }

    if (error) {
      console.error("Admin user status update failed", {
        targetUserId: targetUser.user_id,
        status,
        error
      });
      toast.error(error.message || "Could not update user status");
    }
    else {
      toast.success(status === "active" ? "User reactivated" : "User suspended");
      loadAdminData();
    }
    setWorking(false);
  };

  const deleteUser = async (targetUser) => {
    if (!isSuperAdmin) {
      toast.error("Only Super Admins can delete users");
      return false;
    }
    if (targetUser.user_id === user.id) {
      toast.error("You cannot delete your own account here");
      return false;
    }

    setWorking(true);
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (sessionError || !accessToken) {
      console.error("Admin delete could not obtain an authenticated session", sessionError);
      toast.error("Your admin session has expired. Sign in again and retry.");
      setWorking(false);
      return false;
    }

    const { data, error } = await supabase.functions.invoke("admin-user-actions", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: {
        action: "delete_user",
        targetUserId: targetUser.user_id,
        email: targetUser.email
      }
    });

    if (error || !data?.ok) {
      console.error("Admin delete user failed", {
        functionName: "admin-user-actions",
        targetUserId: targetUser.user_id,
        response: data,
        error
      });
      toast.error(await getAdminActionErrorMessage(error, data));
      setWorking(false);
      return false;
    }

    toast.success("User and associated data deleted");
    loadAdminData();
    setWorking(false);
    return true;
  };

  const changeUserType = async (targetUser, userType) => {
    const currentType = getUserType(targetUser);
    if (internalAdminTypes.includes(userType) && !isSuperAdmin) {
      toast.error("Only Super Admins can assign admin roles");
      return;
    }
    if (internalAdminTypes.includes(currentType) && !isSuperAdmin) {
      toast.error("Only Super Admins can remove admin roles");
      return;
    }
    if (targetUser.user_id === user.id && currentType === "super_admin" && userType !== "super_admin") {
      toast.error("You cannot remove your own Super Admin access");
      return;
    }

    setWorking(true);
    const { error } = await supabase.rpc("admin_set_user_type", {
      target_user_id: targetUser.user_id,
      new_user_type: userType
    });

    if (error) {
      console.error("Admin user type update failed", {
        targetUserId: targetUser.user_id,
        userType,
        error
      });
      toast.error(isMissingRpcError(error) ? "Run admin_user_types_notifications.sql first" : error.message || "Could not update user type");
    }
    else {
      toast.success("User type updated");
      loadAdminData();
    }
    setWorking(false);
  };

  const toggleUserTypeFeature = async (userType, featureKey, enabled) => {
    setWorking(true);
    const { error } = await supabase
      .from("user_type_feature_access")
      .upsert({ user_type: userType, feature_key: featureKey, is_enabled: enabled, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "user_type,feature_key" });

    if (error) toast.error("Run admin_user_types_notifications.sql first");
    else {
      await audit("feature_access_changed", null, { userType, featureKey, enabled });
      toast.success("Feature access updated");
      loadAdminData();
    }
    setWorking(false);
  };

  const sendAdminMessage = async () => {
    if (!message.title.trim() || !message.body.trim()) return toast.error("Add a title and message");
    setWorking(true);
    const { error } = await supabase.rpc("admin_send_announcement", {
      announcement_title: message.title.trim(),
      announcement_body: message.body.trim(),
      audience: message.audience
    });

    if (error) toast.error(error.message || "Could not send announcement");
    else {
      await audit("announcement_sent", null, message);
      toast.success("Announcement queued");
      setMessage({ title: "", body: "", audience: "all" });
      loadAdminData();
    }
    setWorking(false);
  };

  const deleteAdminMessage = async (historyItem) => {
    if (!historyItem?.ids?.length) return;
    setWorking(true);
    const { error } = await supabase
      .from("notifications")
      .delete()
      .in("id", historyItem.ids);

    if (error) toast.error(error.message || "Could not delete admin message");
    else {
      await audit("announcement_deleted", null, {
        title: historyItem.title,
        deleted_notifications: historyItem.ids.length
      });
      toast.success("Admin message deleted");
      loadAdminData();
    }
    setWorking(false);
  };

  const updatePlanField = (tier, field, value) => {
    setSubscriptions(prev => prev.map(plan => plan.tier === tier ? { ...plan, [field]: value } : plan));
  };

  const savePlan = async (plan) => {
    setWorking(true);
    const { error } = await supabase
      .from("subscription_plans")
      .upsert({
        tier: plan.tier,
        name: plan.name || plan.tier,
        description: plan.description || "",
        monthly_price_pence: Number(plan.monthly_price_pence || 0),
        yearly_price_pence: Number(plan.yearly_price_pence || 0),
        is_active: plan.is_active !== false,
        sort_order: Number(plan.sort_order || 0),
        updated_at: new Date().toISOString()
      }, { onConflict: "tier" });

    if (error) {
      toast.error(error.message || "Could not save plan");
    } else {
      await audit("subscription_plan_updated", null, { tier: plan.tier });
      toast.success("Plan saved");
      loadAdminData();
    }
    setWorking(false);
  };

  const togglePlanFeature = async (tier, featureKey, enabled) => {
    setWorking(true);
    const updates = [
      supabase
        .from("subscription_feature_access")
        .upsert({ subscription_tier: tier, feature_key: featureKey, is_enabled: enabled, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "subscription_tier,feature_key" })
    ];

    if (userTypeOptions.includes(tier)) {
      updates.push(
        supabase
          .from("user_type_feature_access")
          .upsert({ user_type: tier, feature_key: featureKey, is_enabled: enabled, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "user_type,feature_key" })
      );
    }

    const results = await Promise.all(updates);
    const error = results.find(result => result.error)?.error;

    if (error) {
      toast.error(error.message || "Could not update plan feature");
    } else {
      await audit("subscription_feature_changed", null, { tier, featureKey, enabled });
      toast.success("Plan feature updated");
      loadAdminData();
    }
    setWorking(false);
  };

  const loadSupportMessages = async (conversationId) => {
    if (!conversationId) return;
    setSupportLoading(true);
    const { data, error } = await supabase.rpc("admin_get_support_messages", { conversation_uuid: conversationId });

    if (error) {
      console.error("Support messages failed to load", error);
      toast.error(isMissingRpcError(error) ? "Run admin_support_mailbox_and_plans.sql first" : error.message || "Could not load support messages");
      setSupportMessages([]);
    } else {
      setSupportMessages(data || []);
      await supabase.rpc("admin_mark_support_conversation_read", { conversation_uuid: conversationId });
      window.dispatchEvent(new Event("notificationsUpdated"));
    }
    setSupportLoading(false);
  };

  const selectSupportThread = (thread) => {
    setSelectedSupportThread(thread);
    setSupportReply("");
    setSupportReplyAttachments([]);
    if (thread?.conversation_id) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set("tab", "mailbox");
        next.set("conversation", thread.conversation_id);
        return next;
      }, { replace: true });
      loadSupportMessages(thread.conversation_id);
    }
  };

  const uploadSupportReplyAttachments = async (conversationId, files) => {
    const uploaded = [];
    for (const file of files) {
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const randomId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const path = `${conversationId}/${randomId}-${cleanName}`;
      const { error } = await supabase.storage
        .from(MESSAGE_ATTACHMENT_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (error) throw error;
      uploaded.push({ path, name: file.name, type: file.type, size: file.size });
    }
    return uploaded;
  };

  const sendSupportReply = async () => {
    if (!selectedSupportThread?.conversation_id || (!supportReply.trim() && supportReplyAttachments.length === 0)) return;
    setWorking(true);
    const cachedReply = supportReply;
    const cachedAttachments = supportReplyAttachments;
    setSupportReply("");
    setSupportReplyAttachments([]);

    try {
      const attachments = cachedAttachments.length ? await uploadSupportReplyAttachments(selectedSupportThread.conversation_id, cachedAttachments) : [];
      const { data: messageId, error } = await supabase.rpc("admin_support_reply", {
        conversation_uuid: selectedSupportThread.conversation_id,
        reply_body: cachedReply.trim(),
        reply_attachments: attachments
      });

      if (error) throw error;
      await sendMessagePushNotification({
        recipientId: selectedSupportThread.user_id,
        title: "New message from Admin",
        body: cachedReply.trim() || "Admin sent an attachment.",
        messageId,
        conversationId: selectedSupportThread.conversation_id,
        route: `/messages?conversation=${selectedSupportThread.conversation_id}`
      });
      await audit("admin_support_reply_sent", selectedSupportThread.user_id, { conversation_id: selectedSupportThread.conversation_id });
      toast.success("Reply sent");
      await loadSupportMessages(selectedSupportThread.conversation_id);
      loadAdminData();
    } catch (error) {
      toast.error(isMissingRpcError(error) ? "Run admin_support_mailbox_and_plans.sql first" : error.message || "Could not send reply");
      setSupportReply(cachedReply);
      setSupportReplyAttachments(cachedAttachments);
    } finally {
      setWorking(false);
    }
  };

  const sendSupportCompose = async () => {
    const recipientIds = [...new Set(supportComposeRecipientIds)];
    if (recipientIds.length === 0) return toast.error("Choose at least one user");
    if (!supportComposeBody.trim() && supportComposeAttachments.length === 0) return toast.error("Write a message or add an attachment");

    setWorking(true);
    const cachedBody = supportComposeBody;
    const cachedAttachments = supportComposeAttachments;

    try {
      for (const recipientId of recipientIds) {
        const { data: conversationId, error: conversationError } = await supabase.rpc("admin_get_or_create_support_conversation_for_user", {
          target_user_id: recipientId
        });
        if (conversationError) throw conversationError;

        const attachments = cachedAttachments.length ? await uploadSupportReplyAttachments(conversationId, cachedAttachments) : [];
        const { data: messageId, error: replyError } = await supabase.rpc("admin_support_reply", {
          conversation_uuid: conversationId,
          reply_body: cachedBody.trim(),
          reply_attachments: attachments
        });
        if (replyError) throw replyError;

        await sendMessagePushNotification({
          recipientId,
          title: "New message from Admin",
          body: cachedBody.trim() || "Admin sent an attachment.",
          messageId,
          conversationId,
          route: `/messages?conversation=${conversationId}`
        });
      }

      await audit("admin_support_message_sent", recipientIds.length === 1 ? recipientIds[0] : null, { count: recipientIds.length });
      toast.success(`Admin message sent to ${recipientIds.length} user${recipientIds.length === 1 ? "" : "s"}`);
      setSupportComposeBody("");
      setSupportComposeAttachments([]);
      setSupportComposeRecipientIds([]);
      setSupportComposeQuery("");
      setSupportComposeOpen(false);
      loadAdminData();
    } catch (error) {
      toast.error(isMissingRpcError(error) ? "Run admin_support_mailbox_and_plans.sql first" : error.message || "Could not send admin message");
    } finally {
      setWorking(false);
    }
  };

  const updateSupportStatus = async (thread, status) => {
    if (!thread?.conversation_id) return;
    setWorking(true);
    const { error } = await supabase.rpc("admin_set_support_conversation_status", {
      conversation_uuid: thread.conversation_id,
      next_status: status
    });

    if (error) toast.error(error.message || "Could not update support status");
    else {
      await audit("admin_support_status_changed", thread.user_id, { conversation_id: thread.conversation_id, status });
      toast.success(status === "open" ? "Thread reopened" : "Thread marked resolved");
      loadAdminData();
    }
    setWorking(false);
  };

  const deleteSupportThread = async (thread) => {
    if (!thread?.conversation_id) return;
    setWorking(true);
    try {
      const { data: messageRows, error: messagesError } = await supabase.rpc("admin_get_support_messages", {
        conversation_uuid: thread.conversation_id
      });
      if (messagesError) throw messagesError;

      const attachmentPaths = (messageRows || [])
        .flatMap(item => normaliseAttachments(item.attachments))
        .map(item => item.path)
        .filter(Boolean);

      const { error } = await supabase.rpc("admin_delete_support_conversation", {
        conversation_uuid: thread.conversation_id
      });
      if (error) throw error;

      if (attachmentPaths.length) {
        await supabase.storage.from(MESSAGE_ATTACHMENT_BUCKET).remove(attachmentPaths);
      }

      setSupportThreads(prev => prev.filter(item => item.conversation_id !== thread.conversation_id));
      if (selectedSupportThread?.conversation_id === thread.conversation_id) {
        setSelectedSupportThread(null);
        setSupportMessages([]);
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.set("tab", "mailbox");
          next.delete("conversation");
          return next;
        }, { replace: true });
      }
      await audit("admin_support_thread_deleted", thread.user_id, { conversation_id: thread.conversation_id });
      toast.success("Mailbox thread deleted");
      setSupportThreadToDelete(null);
      loadAdminData();
    } catch (error) {
      toast.error(isMissingRpcError(error) ? "Run admin_support_mailbox_and_plans.sql first" : error.message || "Could not delete mailbox thread");
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <LoadingState label="Loading admin dashboard..." darkMode={darkMode} />;

  if (!adminRole) {
    return (
      <div className="space-y-5">
        <PageBanner title="Admin" subtitle="This area is restricted to VetLearn administrators." darkMode={darkMode} />
        <section className={panelClass}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-orange-500 shrink-0" />
            <div>
              <h2 className="text-xl font-black mb-2">Admin access required</h2>
              <p className="text-sm opacity-70 leading-6">Your account does not currently have an active Admin or Super Admin role.</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <PageBanner
        title="Admin Dashboard"
        subtitle="Manage users, permissions, subscriptions, app content and system activity."
        darkMode={darkMode}
        badges={[
          { label: adminRole === "super_admin" ? "Super Admin" : "Admin", icon: <ShieldCheck size={14} />, accent: true },
          ...(adminAlertCounts.total > 0 ? [{ label: `${adminAlertCounts.total} new`, icon: <Bell size={14} />, accent: true }] : [])
        ]}
      />

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {adminTabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const badgeCount = getAdminTabBadgeCount(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => selectAdminTab(tab.id)}
              className={`relative shrink-0 rounded-full px-4 py-3 text-sm font-black flex items-center gap-2 ${
                active ? "bg-[#71CFC2] text-[#062F63] shadow-lg" : darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0B3760]"
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {badgeCount > 0 && (
                <span className="ml-1 grid min-w-[18px] h-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && <Overview stats={stats} error={statsError} panelClass={panelClass} darkMode={darkMode} onRefresh={loadAdminData} />}
      {activeTab === "users" && (
        <UsersPanel
          panelClass={panelClass}
          darkMode={darkMode}
          users={filteredUsers}
          query={query}
          setQuery={setQuery}
          onStatus={updateUserStatus}
          onDelete={deleteUser}
          onUserType={changeUserType}
          currentUserId={user.id}
          isSuperAdmin={isSuperAdmin}
          working={working}
          error={usersError}
          onExportMarketing={() => exportEmailList("marketing")}
          onExportAllEmails={() => exportEmailList("all")}
        />
      )}
      {activeTab === "permissions" && <PermissionsPanel panelClass={panelClass} darkMode={darkMode} isSuperAdmin={isSuperAdmin} />}
      {activeTab === "features" && <FeaturesPanel panelClass={panelClass} darkMode={darkMode} matrix={featureMatrix} onToggle={toggleUserTypeFeature} working={working} />}
      {activeTab === "subscriptions" && (
        <SubscriptionsPanel
          panelClass={panelClass}
          darkMode={darkMode}
          subscriptions={subscriptions}
          features={appFeatures}
          userTypeMatrix={featureMatrix}
          subscriptionMatrix={subscriptionFeatureMatrix}
          onPlanField={updatePlanField}
          onSavePlan={savePlan}
          onToggleFeature={togglePlanFeature}
          working={working}
        />
      )}
      {activeTab === "messages" && (
        <MessagingPanel
          panelClass={panelClass}
          darkMode={darkMode}
          message={message}
          setMessage={setMessage}
          onSend={sendAdminMessage}
          working={working}
          history={adminMessages}
          onDeleteHistory={deleteAdminMessage}
        />
      )}
      {activeTab === "mailbox" && (
        <MailboxPanel
          panelClass={panelClass}
          darkMode={darkMode}
          threads={filteredSupportThreads}
          allThreads={supportThreads}
          filter={supportFilter}
          setFilter={setSupportFilter}
          selectedThread={selectedSupportThread}
          onSelectThread={selectSupportThread}
          messages={supportMessages}
          loading={supportLoading}
          reply={supportReply}
          setReply={setSupportReply}
          replyAttachments={supportReplyAttachments}
          setReplyAttachments={setSupportReplyAttachments}
          users={users}
          composeOpen={supportComposeOpen}
          setComposeOpen={setSupportComposeOpen}
          composeQuery={supportComposeQuery}
          setComposeQuery={setSupportComposeQuery}
          composeRecipientIds={supportComposeRecipientIds}
          setComposeRecipientIds={setSupportComposeRecipientIds}
          composeBody={supportComposeBody}
          setComposeBody={setSupportComposeBody}
          composeAttachments={supportComposeAttachments}
          setComposeAttachments={setSupportComposeAttachments}
          onSendCompose={sendSupportCompose}
          onReply={sendSupportReply}
          onStatus={updateSupportStatus}
          onRequestDeleteThread={setSupportThreadToDelete}
          working={working}
        />
      )}
      {activeTab === "audit" && <AdminActivityExplorer darkMode={darkMode} />}
      {activeTab === "settings" && <AdminSettings panelClass={panelClass} />}

      {supportThreadToDelete && (
        <AppPopup
          open={!!supportThreadToDelete}
          onClose={() => !working && setSupportThreadToDelete(null)}
          darkMode={darkMode}
          {...popupPresets.deleteConversation({
            colleagueName: supportThreadToDelete.sender_name || "this user",
            title: "Delete mailbox thread?",
            message: "This will delete the whole Admin mailbox thread and all messages inside it.",
            footerLabel: "ADMIN MAILBOX",
            primaryLabel: "Delete thread",
            onPrimary: () => deleteSupportThread(supportThreadToDelete),
            onSecondary: () => setSupportThreadToDelete(null),
            primaryLoading: working,
            primaryDisabled: working,
            secondaryDisabled: working
          })}
        />
      )}
    </div>
  );
}

function Overview({ stats, error, panelClass, darkMode, onRefresh }) {
  const userMetrics = [
    ["Total users", stats?.totalUsers],
    ["Active users", stats?.activeUsers],
    ["Suspended users", stats?.suspendedUsers],
    ["Administrators", stats?.admins],
    ["New this week", stats?.newWeek]
  ];
  const activityMetrics = [
    ["CPD entries", stats?.cpdEntries],
    ["Case logs", stats?.caseLogs],
    ["Protocols", stats?.protocols],
    ["Posts", stats?.posts],
    ["Messages", stats?.messages],
    ["Connections", stats?.connections]
  ];

  const chartData = [...userMetrics, ...activityMetrics]
    .filter(([, value]) => Number.isFinite(value))
    .map(([name, value]) => ({ name, value }));

  return (
    <section className={panelClass}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-black">Overview</h2>
        <button onClick={onRefresh} className={`rounded-lg px-3 py-2 text-sm font-bold flex items-center gap-2 ${darkMode ? "bg-white/10" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {error && <AdminDataNotice title="Overview stats unavailable" message={error} darkMode={darkMode} />}
      {stats?.missingObjects?.length > 0 && (
        <AdminDataNotice
          title="Some activity totals are unavailable"
          message={`Missing Supabase objects: ${stats.missingObjects.join(", ")}. Run supabase/admin_dashboard_reliability_fix.sql.`}
          darkMode={darkMode}
          warning
        />
      )}

      <h3 className="mb-3 mt-5 text-sm font-black uppercase tracking-[0.12em] opacity-60">Users</h3>
      <MetricGrid metrics={userMetrics} darkMode={darkMode} />
      <h3 className="mb-3 mt-6 text-sm font-black uppercase tracking-[0.12em] opacity-60">Activity</h3>
      <MetricGrid metrics={activityMetrics} darkMode={darkMode} />

      {(stats?.byRole?.length > 0 || stats?.byTier?.length > 0) && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <BreakdownCard title="Users by role" rows={stats.byRole} darkMode={darkMode} />
          <BreakdownCard title="Users by subscription tier" rows={stats.byTier} darkMode={darkMode} />
        </div>
      )}

      {chartData.length > 0 ? (
        <div className="h-72 mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={80} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#71CFC2" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !error && <AdminDataNotice title="No overview data yet" message="The dashboard query completed but did not return any countable records." darkMode={darkMode} />
      )}
    </section>
  );
}

function UsersPanel({ panelClass, darkMode, users, query, setQuery, onStatus, onDelete, onUserType, currentUserId, isSuperAdmin, working, error, onExportMarketing, onExportAllEmails }) {
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  return (
    <section className={panelClass}>
      <div className={`mb-5 flex items-center gap-2 rounded-2xl border px-4 ${darkMode ? "border-white/10 bg-white/10" : "border-[#D6E9E6] bg-[#F2F8F7]"}`}>
        <Search size={18} className="opacity-50" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search users" className="w-full bg-transparent py-3.5 outline-none" />
      </div>
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={working}
          onClick={onExportMarketing}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition disabled:opacity-50 ${darkMode ? "bg-white/10 text-slate-100 hover:bg-white/15" : "bg-[#E8F8F5] text-[#0B3760] hover:bg-[#D5F0EC]"}`}
        >
          <Download size={16} /> Export marketing opt-ins
        </button>
        <button
          type="button"
          disabled={working}
          onClick={onExportAllEmails}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition disabled:opacity-50 ${darkMode ? "bg-white/10 text-slate-100 hover:bg-white/15" : "bg-[#E8F8F5] text-[#0B3760] hover:bg-[#D5F0EC]"}`}
        >
          <Download size={16} /> Export all emails
        </button>
      </div>
      {error && <AdminDataNotice title="Users could not be loaded" message={error} darkMode={darkMode} />}
      <div className="space-y-5">
        {users.map(item => {
          const marketingStatus = getMarketingOptInStatus(item);
          return (
            <article key={item.user_id} className={`rounded-2xl border p-5 shadow-[0_10px_28px_rgba(11,55,96,0.05)] ${darkMode ? "border-white/10 bg-white/[0.07]" : "border-[#D6E9E6] bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className={`truncate text-xl font-black ${darkMode ? "text-white" : "text-[#0B3552]"}`}>{item.full_name || item.email}</h3>
                  <p className={`mt-1 truncate text-base ${darkMode ? "text-slate-300" : "text-[#667F91]"}`}>{item.email}</p>
                </div>
                <StatusBadge status={item.account_status} />
              </div>
              <p className={`mt-2 text-sm ${darkMode ? "text-slate-400" : "text-[#8A9CAA]"}`}>
                Joined {formatAdminDate(item.created_at)} - Last login {formatAdminDate(item.last_sign_in_at)}
              </p>
              <div className={`mt-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
                <span className="flex min-w-0 items-center gap-2 font-bold opacity-75"><Mail size={15} /> Marketing emails</span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${marketingStatus.className}`}>{marketingStatus.label}</span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <select disabled={working} value={getUserType(item)} onChange={event => onUserType(item, event.target.value)} className={`min-w-0 rounded-xl border-0 px-4 py-3.5 text-sm font-black outline-none disabled:opacity-50 ${darkMode ? "bg-[#102C36] text-white" : "bg-[#EFF6F5] text-[#0B3552]"}`}>
                  {userTypeOptions.map(type => <option key={type} value={type}>{userTypeLabels[type]}</option>)}
                </select>
                <button
                  disabled={working}
                  onClick={() => onStatus(item, item.account_status === "active" ? "suspended" : "active")}
                  className="rounded-xl bg-[#71CFC2] px-4 py-3.5 text-sm font-black text-[#062F63] shadow-sm transition hover:bg-[#61C4B7] disabled:opacity-50"
                >
                  {item.account_status === "active" ? "Suspend" : "Reactivate"}
                </button>
                <button
                  disabled={working || !isSuperAdmin || item.user_id === currentUserId}
                  onClick={() => setDeleteCandidate(item)}
                  className={`col-span-2 flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? "bg-red-500/15 text-red-300 hover:bg-red-500/20" : "bg-[#FFF0F1] text-[#E00019] hover:bg-[#FFE5E7]"}`}
                >
                  <Trash2 size={19} /> Delete user and data
                </button>
              </div>
            </article>
          );
        })}
        {!error && users.length === 0 && (
          <div className={`rounded-2xl border p-6 text-center text-sm ${darkMode ? "border-white/10 bg-white/[0.06] text-slate-300" : "border-[#D6E9E6] bg-white text-[#667F91]"}`}>
            {query ? "No users match that search." : "No users were returned by Supabase."}
          </div>
        )}
      </div>

      {deleteCandidate && (
        <AppPopup
          open={!!deleteCandidate}
          onClose={() => !working && setDeleteCandidate(null)}
          darkMode={darkMode}
          {...popupPresets.deleteUser({
            email: deleteCandidate.email,
            onPrimary: async () => {
              const success = await onDelete(deleteCandidate);
              if (success) setDeleteCandidate(null);
            },
            onSecondary: () => setDeleteCandidate(null),
            primaryLoading: working,
            primaryDisabled: working,
            secondaryDisabled: working
          })}
        />
      )}
    </section>
  );
}

function PermissionsPanel({ panelClass, darkMode, isSuperAdmin }) {
  return (
    <section className={panelClass}>
      <h2 className="text-xl font-black mb-3">Roles & Permissions</h2>
      <p className="text-sm opacity-65 leading-6 mb-4">User type controls app access. Admin and Super Admin are internal permission roles and should not be treated as paid plans.</p>
      <div className="space-y-3">
        {userTypeOptions.map(type => (
          <div key={type} className={`rounded-lg p-4 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
            <h3 className="font-black">{userTypeLabels[type]}</h3>
            <p className="text-sm opacity-65 mt-1">{roleDescription(type)}</p>
          </div>
        ))}
      </div>
      {!isSuperAdmin && <p className="mt-4 text-xs text-orange-500 font-bold">Only Super Admins may assign or remove Admin and Super Admin roles.</p>}
    </section>
  );
}

function FeaturesPanel({ panelClass, darkMode, matrix, onToggle, working }) {
  const lookup = (userType, featureKey) => matrix.find(item => (item.user_type || item.subscription_tier) === userType && item.feature_key === featureKey)?.is_enabled ?? false;
  return (
    <section className={panelClass}>
      <h2 className="text-xl font-black mb-3">Feature Access</h2>
      <p className="text-sm opacity-65 leading-6 mb-4">Toggle access by user type. Changes are stored in Supabase and apply after users refresh or log in again.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left opacity-60"><th className="p-2">Feature</th>{userTypeOptions.map(type => <th key={type} className="p-2">{userTypeLabels[type]}</th>)}</tr>
          </thead>
          <tbody>
            {Object.entries(featureLabels).map(([key, label]) => (
              <tr key={key} className={darkMode ? "border-t border-white/10" : "border-t border-[#DCEDEA]"}>
                <td className="p-2 font-black">{label}</td>
                {userTypeOptions.map(type => (
                  <td key={type} className="p-2"><button disabled={working} onClick={() => onToggle(type, key, !lookup(type, key))} className={`rounded-full px-3 py-1 text-xs font-black ${lookup(type, key) ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"}`}>{lookup(type, key) ? "On" : "Off"}</button></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SubscriptionsPanel({ panelClass, darkMode, subscriptions, features, userTypeMatrix, subscriptionMatrix, onPlanField, onSavePlan, onToggleFeature, working }) {
  const [priceDrafts, setPriceDrafts] = useState({});
  const lookup = (tier, featureKey) => {
    const typeValue = userTypeMatrix.find(item => (item.user_type || item.subscription_tier) === tier && item.feature_key === featureKey)?.is_enabled;
    if (typeValue !== undefined) return typeValue;
    return subscriptionMatrix.find(item => item.subscription_tier === tier && item.feature_key === featureKey)?.is_enabled ?? false;
  };
  const priceKey = (tier, field) => `${tier}:${field}`;
  const priceValue = (tier, field, pence) => priceDrafts[priceKey(tier, field)] ?? penceToPounds(pence);
  const updatePrice = (tier, field, value) => {
    if (!/^\d*(\.\d{0,2})?$/.test(value)) return;
    setPriceDrafts(prev => ({ ...prev, [priceKey(tier, field)]: value }));
    onPlanField(tier, field, value === "" ? 0 : poundsToPence(value));
  };
  const normalisePrice = (tier, field) => {
    setPriceDrafts(prev => {
      const next = { ...prev };
      delete next[priceKey(tier, field)];
      return next;
    });
  };

  return (
    <section className={panelClass}>
      <h2 className="text-xl font-black mb-3">Plans & Pricing</h2>
      <p className="text-sm opacity-65 leading-6 mb-4">Edit plan names, pricing and included features. Admin and Super Admin remain internal permission roles.</p>
      <div className="space-y-4">
        {subscriptions.map(plan => (
          <article key={plan.tier} className={`rounded-2xl border p-4 ${darkMode ? "border-white/10 bg-white/10" : "border-[#DCEDEA] bg-[#F4F9F8]"}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="rounded-full bg-[#71CFC2] px-3 py-1 text-xs font-black text-[#062F63]">{plan.tier}</span>
              <label className="flex items-center gap-2 text-xs font-black">
                <input type="checkbox" checked={plan.is_active !== false} onChange={event => onPlanField(plan.tier, "is_active", event.target.checked)} />
                Available to users
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={plan.name || ""} onChange={event => onPlanField(plan.tier, "name", event.target.value)} placeholder="Plan name" className={`rounded-lg p-3 text-sm font-bold outline-none ${darkMode ? "bg-[#071A24] text-white" : "bg-white text-[#113247]"}`} />
              <input type="number" step="1" value={plan.sort_order ?? 0} onChange={event => onPlanField(plan.tier, "sort_order", event.target.value)} placeholder="Sort order" className={`rounded-lg p-3 text-sm font-bold outline-none ${darkMode ? "bg-[#071A24] text-white" : "bg-white text-[#113247]"}`} />
              <label className="text-xs font-black uppercase tracking-[0.12em] opacity-70">
                Monthly GBP
                <input type="text" inputMode="decimal" value={priceValue(plan.tier, "monthly_price_pence", plan.monthly_price_pence)} onChange={event => updatePrice(plan.tier, "monthly_price_pence", event.target.value)} onBlur={() => normalisePrice(plan.tier, "monthly_price_pence")} className={`mt-1 w-full rounded-lg p-3 text-sm font-bold outline-none ${darkMode ? "bg-[#071A24] text-white" : "bg-white text-[#113247]"}`} />
              </label>
              <label className="text-xs font-black uppercase tracking-[0.12em] opacity-70">
                Annual GBP
                <input type="text" inputMode="decimal" value={priceValue(plan.tier, "yearly_price_pence", plan.yearly_price_pence)} onChange={event => updatePrice(plan.tier, "yearly_price_pence", event.target.value)} onBlur={() => normalisePrice(plan.tier, "yearly_price_pence")} className={`mt-1 w-full rounded-lg p-3 text-sm font-bold outline-none ${darkMode ? "bg-[#071A24] text-white" : "bg-white text-[#113247]"}`} />
              </label>
            </div>
            <textarea value={plan.description || ""} onChange={event => onPlanField(plan.tier, "description", event.target.value)} placeholder="Plan description" rows={3} className={`mt-3 w-full rounded-lg p-3 text-sm outline-none ${darkMode ? "bg-[#071A24] text-white" : "bg-white text-[#113247]"}`} />

            <div className="mt-4">
              <h3 className="mb-2 text-sm font-black">Included Features</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {features.map(feature => {
                  const enabled = lookup(plan.tier, feature.feature_key);
                  return (
                    <button
                      key={feature.feature_key}
                      type="button"
                      disabled={working}
                      onClick={() => onToggleFeature(plan.tier, feature.feature_key, !enabled)}
                      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs font-black transition disabled:opacity-50 ${enabled ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-black/20 text-slate-300" : "bg-white text-[#667F91]"}`}
                    >
                      <span className="truncate">{feature.name || feature.feature_key}</span>
                      <span>{enabled ? "On" : "Off"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <button disabled={working} onClick={() => onSavePlan(plan)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B3760] p-3 text-sm font-black text-white disabled:opacity-50">
              <Save size={16} /> Save Plan
            </button>
          </article>
        ))}
        {subscriptions.length === 0 && <div className={`rounded-lg p-4 text-sm opacity-65 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>No subscription plans found. Run the admin dashboard SQL setup first.</div>}
      </div>
    </section>
  );
}

function MailboxPanel({
  panelClass,
  darkMode,
  threads,
  allThreads,
  filter,
  setFilter,
  selectedThread,
  onSelectThread,
  messages,
  loading,
  reply,
  setReply,
  replyAttachments,
  setReplyAttachments,
  users,
  composeOpen,
  setComposeOpen,
  composeQuery,
  setComposeQuery,
  composeRecipientIds,
  setComposeRecipientIds,
  composeBody,
  setComposeBody,
  composeAttachments,
  setComposeAttachments,
  onSendCompose,
  onReply,
  onStatus,
  onRequestDeleteThread,
  working
}) {
  const filterClass = (value) => `rounded-full px-3 py-2 text-xs font-black transition ${
    filter === value ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"
  }`;
  const attachmentInputRef = useRef(null);
  const composeAttachmentInputRef = useRef(null);
  const selectableUsers = useMemo(() => {
    const q = composeQuery.trim().toLowerCase();
    return (users || [])
      .filter(item => item.user_id && item.email)
      .filter(item => {
        if (!q) return true;
        return [item.full_name, item.email, getUserType(item)]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(q));
      })
      .slice(0, 40);
  }, [composeQuery, users]);
  const selectedRecipients = useMemo(() => {
    const selected = new Set(composeRecipientIds);
    return (users || []).filter(item => selected.has(item.user_id));
  }, [composeRecipientIds, users]);

  const toggleRecipient = (userId) => {
    setComposeRecipientIds(prev => prev.includes(userId)
      ? prev.filter(id => id !== userId)
      : [...prev, userId]
    );
  };

  const addAttachments = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length) setReplyAttachments(prev => [...prev, ...files].slice(0, 6));
    event.target.value = "";
  };
  const addComposeAttachments = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length) setComposeAttachments(prev => [...prev, ...files].slice(0, 6));
    event.target.value = "";
  };

  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <div className="flex items-start gap-3 mb-4">
          <Inbox className="text-[#0F8F83] shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black">Admin Mailbox</h2>
            <p className="text-sm opacity-65">Handle user messages sent to Admin.</p>
          </div>
          <button
            type="button"
            onClick={() => setComposeOpen(open => !open)}
            className="shrink-0 rounded-lg bg-[#71CFC2] px-3 py-2 text-xs font-black text-[#062F63]"
          >
            {composeOpen ? "Close" : "New message"}
          </button>
        </div>

        {composeOpen && (
          <div className={`mb-5 rounded-2xl border p-4 ${darkMode ? "border-white/10 bg-white/10" : "border-[#DCEDEA] bg-[#F4F9F8]"}`}>
            <div className="mb-3 flex items-start gap-3">
              <Send className="mt-0.5 shrink-0 text-[#0F8F83]" size={18} />
              <div>
                <h3 className="font-black">New Admin message</h3>
                <p className="text-xs leading-5 opacity-65">Select one user or multiple users to send the same Admin message.</p>
              </div>
            </div>

            <div className={`mb-3 flex items-center gap-2 rounded-xl border px-3 ${darkMode ? "border-white/10 bg-black/20" : "border-[#D6E9E6] bg-white"}`}>
              <Search size={16} className="opacity-50" />
              <input
                value={composeQuery}
                onChange={event => setComposeQuery(event.target.value)}
                placeholder="Search users to message"
                className="w-full bg-transparent py-3 text-sm outline-none"
              />
            </div>

            {selectedRecipients.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {selectedRecipients.map(item => (
                  <button
                    key={item.user_id}
                    type="button"
                    onClick={() => toggleRecipient(item.user_id)}
                    className={`flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-xs font-black ${darkMode ? "bg-[#71CFC2]/20 text-[#71CFC2]" : "bg-[#E4F7F3] text-[#0F8F83]"}`}
                  >
                    <span className="max-w-[180px] truncate">{item.full_name || item.email}</span>
                    <X size={13} />
                  </button>
                ))}
              </div>
            )}

            <div className="mb-3 grid max-h-48 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {selectableUsers.map(item => {
                const selected = composeRecipientIds.includes(item.user_id);
                return (
                  <button
                    key={item.user_id}
                    type="button"
                    onClick={() => toggleRecipient(item.user_id)}
                    className={`rounded-xl border p-3 text-left transition ${selected ? "border-[#71CFC2] bg-[#71CFC2]/15" : darkMode ? "border-white/10 bg-black/20" : "border-[#DCEDEA] bg-white"}`}
                  >
                    <span className="block truncate text-sm font-black">{item.full_name || item.email}</span>
                    <span className="block truncate text-xs opacity-60">{item.email}</span>
                  </button>
                );
              })}
              {selectableUsers.length === 0 && (
                <div className={`rounded-xl p-4 text-sm opacity-65 ${darkMode ? "bg-black/20" : "bg-white"}`}>No users match that search.</div>
              )}
            </div>

            {composeAttachments.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {composeAttachments.map((file, index) => (
                  <button
                    key={`${file.name}-${index}`}
                    type="button"
                    onClick={() => setComposeAttachments(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                    className={`flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#113247]"}`}
                  >
                    <Paperclip size={13} />
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <X size={13} />
                  </button>
                ))}
              </div>
            )}

            <textarea
              value={composeBody}
              onChange={event => setComposeBody(event.target.value)}
              placeholder="Write as Admin..."
              rows={4}
              className={`w-full rounded-lg p-3 text-sm outline-none ${darkMode ? "bg-[#071A24] text-white placeholder:text-slate-400" : "bg-white text-[#113247]"}`}
            />
            <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr]">
              <input ref={composeAttachmentInputRef} type="file" multiple className="hidden" onChange={addComposeAttachments} />
              <button type="button" onClick={() => composeAttachmentInputRef.current?.click()} className={`rounded-lg px-4 py-3 text-sm font-black ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
                <Paperclip size={16} className="inline-block mr-2" /> Attach
              </button>
              <button disabled={working || composeRecipientIds.length === 0 || (!composeBody.trim() && composeAttachments.length === 0)} onClick={onSendCompose} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#71CFC2] p-3 text-sm font-black text-[#062F63] disabled:opacity-50">
                <Send size={16} /> Send Admin message
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <button className={filterClass("all")} onClick={() => setFilter("all")}>All ({allThreads.length})</button>
          <button className={filterClass("unread")} onClick={() => setFilter("unread")}>Unread</button>
          <button className={filterClass("open")} onClick={() => setFilter("open")}>Open</button>
          <button className={filterClass("resolved")} onClick={() => setFilter("resolved")}>Resolved</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            {threads.map(thread => {
              const selected = selectedThread?.conversation_id === thread.conversation_id;
              return (
                <div
                  key={thread.conversation_id}
                  className={`relative rounded-xl border p-4 pr-14 transition ${selected ? "border-[#71CFC2] bg-[#71CFC2]/15" : darkMode ? "border-white/10 bg-white/10 hover:bg-white/15" : "border-[#DCEDEA] bg-white hover:bg-[#F4F9F8]"}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectThread(thread)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-black">{thread.sender_name || "Unknown user"}</h3>
                        <p className="truncate text-xs opacity-60">{thread.sender_email || thread.sender_title || "Admin conversation"}</p>
                      </div>
                      {Number(thread.unread_count || 0) > 0 && <span className="rounded-full bg-red-500 px-2 py-1 text-xs font-black text-white">{thread.unread_count}</span>}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm opacity-75">{thread.last_message || "No messages yet."}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.12em] opacity-55">
                      <span>{thread.status || "open"}</span>
                      <span>{thread.last_message_at ? new Date(thread.last_message_at).toLocaleDateString("en-GB") : "No date"}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => onRequestDeleteThread(thread)}
                    className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg transition disabled:opacity-40 ${darkMode ? "bg-red-500/15 text-red-200 hover:bg-red-500/25" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
                    aria-label={`Delete mailbox thread from ${thread.sender_name || "user"}`}
                    title="Delete mailbox thread"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            {threads.length === 0 && <div className={`rounded-xl p-4 text-sm opacity-65 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>No support threads for this filter.</div>}
          </div>

          <div className={`rounded-2xl border p-4 ${darkMode ? "border-white/10 bg-black/20" : "border-[#DCEDEA] bg-white"}`}>
            {!selectedThread ? (
              <div className="grid min-h-72 place-items-center text-center text-sm opacity-60">Select a support thread.</div>
            ) : (
              <div className="flex min-h-72 flex-col">
                <div className="mb-4 flex items-start justify-between gap-3 border-b border-inherit pb-3">
                  <div>
                    <h3 className="text-lg font-black">{selectedThread.sender_name}</h3>
                    <p className="text-xs opacity-60">{selectedThread.sender_email}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button disabled={working} onClick={() => onStatus(selectedThread, selectedThread.status === "resolved" ? "open" : "resolved")} className={`rounded-lg px-3 py-2 text-xs font-black disabled:opacity-50 ${darkMode ? "bg-white/10" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
                      {selectedThread.status === "resolved" ? "Reopen" : "Resolve"}
                    </button>
                    <button disabled={working} onClick={() => onRequestDeleteThread(selectedThread)} className={`grid h-9 w-9 place-items-center rounded-lg disabled:opacity-50 ${darkMode ? "bg-red-500/15 text-red-200 hover:bg-red-500/25" : "bg-red-50 text-red-600 hover:bg-red-100"}`} aria-label="Delete mailbox thread" title="Delete mailbox thread">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="max-h-80 flex-1 space-y-3 overflow-y-auto pr-1">
                  {loading ? (
                    <div className="py-8 text-center text-sm opacity-60">Loading messages...</div>
                  ) : messages.length === 0 ? (
                    <div className="py-8 text-center text-sm opacity-60">No messages in this thread.</div>
                  ) : messages.map(item => {
                    const isSupport = item.sender_is_admin === true;
                    const displaySenderName = isSupport ? "Admin" : (item.sender_name || "Unknown user");
                    return (
                      <div key={item.id} className={`flex ${isSupport ? "justify-end" : "justify-start"}`}>
                        <div className={`group relative max-w-[82%] rounded-2xl px-4 py-3 text-sm ${isSupport ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-white" : "bg-[#F0F6F5] text-[#113247]"}`}>
                          <div className="mb-1">
                            <span className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.12em] opacity-55">{displaySenderName}</span>
                          </div>
                          {item.content ? <div className="whitespace-pre-wrap pr-2">{item.content}</div> : null}
                          <AdminMessageAttachmentList attachments={item.attachments} darkMode={darkMode} />
                          <div className="mt-2 text-[10px] opacity-50">{new Date(item.created_at).toLocaleString("en-GB")}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-inherit pt-4">
                  {replyAttachments.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {replyAttachments.map((file, index) => (
                        <button
                          key={`${file.name}-${index}`}
                          type="button"
                          onClick={() => setReplyAttachments(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                          className={`flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#113247]"}`}
                        >
                          <Paperclip size={13} />
                          <span className="max-w-[180px] truncate">{file.name}</span>
                          <X size={13} />
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea value={reply} onChange={event => setReply(event.target.value)} placeholder="Reply as Admin..." rows={3} className={`w-full rounded-lg p-3 text-sm outline-none ${darkMode ? "bg-[#071A24] text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247]"}`} />
                  <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr]">
                    <input ref={attachmentInputRef} type="file" multiple className="hidden" onChange={addAttachments} />
                    <button type="button" onClick={() => attachmentInputRef.current?.click()} className={`rounded-lg px-4 py-3 text-sm font-black ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
                      <Paperclip size={16} className="inline-block mr-2" /> Attach
                    </button>
                    <button disabled={working || (!reply.trim() && replyAttachments.length === 0)} onClick={onReply} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#71CFC2] p-3 text-sm font-black text-[#062F63] disabled:opacity-50">
                      <Reply size={16} /> Send Reply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MessagingPanel({ panelClass, darkMode, message, setMessage, onSend, working, history, onDeleteHistory }) {
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <div className="flex items-start gap-3 mb-4">
          <Mail className="text-[#0F8F83] shrink-0" />
          <div><h2 className="text-xl font-black">Admin Messaging Centre</h2><p className="text-sm opacity-65">Send announcements, maintenance notices and release notes.</p></div>
        </div>
        <div className="space-y-3">
          <select value={message.audience} onChange={(event) => setMessage(prev => ({ ...prev, audience: event.target.value }))} className={`w-full rounded-lg p-3 ${darkMode ? "bg-[#071A24]" : "bg-[#F0F6F5]"}`}>
            <option value="all">All users</option>
            <option value="free">Free users</option>
            <option value="clinician">Clinician users</option>
            <option value="professional">Professional users</option>
            <option value="premium">Premium users</option>
          </select>
          <input value={message.title} onChange={(event) => setMessage(prev => ({ ...prev, title: event.target.value }))} placeholder="Announcement title" className={`w-full rounded-lg p-3 outline-none ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`} />
          <textarea value={message.body} onChange={(event) => setMessage(prev => ({ ...prev, body: event.target.value }))} placeholder="Message" rows={5} className={`w-full rounded-lg p-3 outline-none ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`} />
          <button disabled={working} onClick={onSend} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-4 font-black flex items-center justify-center gap-2"><Send size={18} /> Send Announcement</button>
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex items-start gap-3 mb-4">
          <MessageSquare className="text-[#0F8F83] shrink-0" />
          <div><h2 className="text-xl font-black">Message History</h2><p className="text-sm opacity-65">Delete removes the announcement notification rows from users' notification panels.</p></div>
        </div>
        {history.length === 0 ? (
          <div className={`rounded-lg p-4 text-sm opacity-65 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>No admin messages found yet.</div>
        ) : (
          <div className="space-y-3">
            {history.map(item => (
              <div key={item.key} className={`rounded-lg p-4 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-black truncate">{item.title || "Admin announcement"}</h3>
                    <p className="mt-1 text-sm opacity-70 leading-6 whitespace-pre-wrap">{item.body}</p>
                    <p className="mt-2 text-xs opacity-55">{new Date(item.createdAt).toLocaleString()} · {item.count} notification{item.count === 1 ? "" : "s"} · {item.unreadCount} unread</p>
                  </div>
                  <button disabled={working} onClick={() => setDeleteCandidate(item)} className={`h-9 w-9 rounded-full grid place-items-center shrink-0 ${darkMode ? "bg-red-500/15 text-red-200 hover:bg-red-500/25" : "bg-red-50 text-red-600 hover:bg-red-100"}`} title="Delete admin message" aria-label="Delete admin message"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {deleteCandidate && (
        <AppPopup
          open={!!deleteCandidate}
          onClose={() => !working && setDeleteCandidate(null)}
          darkMode={darkMode}
          {...popupPresets.deleteAdminMessage({
            title: deleteCandidate.title,
            onPrimary: async () => {
              await onDeleteHistory(deleteCandidate);
              setDeleteCandidate(null);
            },
            onSecondary: () => setDeleteCandidate(null),
            primaryLoading: working,
            primaryDisabled: working,
            secondaryDisabled: working
          })}
        />
      )}
    </div>
  );
}

function AdminSettings({ panelClass }) {
  return (
    <section className={panelClass}>
      <h2 className="text-xl font-black mb-3">Admin Settings</h2>
      <div className="space-y-3 text-sm opacity-75 leading-6">
        <p><CheckCircle2 className="inline mr-2 text-[#0F8F83]" size={16} />RLS policies protect admin tables.</p>
        <p><Database className="inline mr-2 text-[#0F8F83]" size={16} />Dashboard metrics use Supabase functions and views.</p>
        <p><SlidersHorizontal className="inline mr-2 text-[#0F8F83]" size={16} />Feature flags are database-driven by user type.</p>
        <p><Bell className="inline mr-2 text-[#0F8F83]" size={16} />Messages and colleague requests create in-app notifications automatically.</p>
      </div>
    </section>
  );
}

function MetricGrid({ metrics, darkMode }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {metrics.map(([label, value]) => (
        <div key={label} className={`rounded-xl border p-4 ${darkMode ? "border-white/10 bg-white/10" : "border-[#DCEDEA] bg-[#F4F9F8]"}`}>
          <div className="truncate text-2xl font-black text-[#0F8F83]">{Number.isFinite(value) ? value.toLocaleString() : "—"}</div>
          <div className="mt-1 text-xs font-bold opacity-65">{label}</div>
          {!Number.isFinite(value) && <div className="mt-1 text-[10px] font-bold text-orange-500">Unavailable</div>}
        </div>
      ))}
    </div>
  );
}

function BreakdownCard({ title, rows = [], darkMode }) {
  return (
    <div className={`rounded-xl border p-4 ${darkMode ? "border-white/10 bg-white/10" : "border-[#DCEDEA] bg-[#F4F9F8]"}`}>
      <h3 className="font-black">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="capitalize opacity-70">{String(row.label).replaceAll("_", " ")}</span>
            <span className="font-black text-[#0F8F83]">{Number(row.count).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminDataNotice({ title, message, darkMode, warning = false }) {
  return (
    <div className={`my-4 rounded-xl border p-4 ${warning ? darkMode ? "border-amber-400/25 bg-amber-400/10" : "border-amber-200 bg-amber-50" : darkMode ? "border-red-400/25 bg-red-400/10" : "border-red-200 bg-red-50"}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className={warning ? "mt-0.5 shrink-0 text-amber-500" : "mt-0.5 shrink-0 text-red-500"} />
        <div>
          <p className="text-sm font-black">{title}</p>
          <p className="mt-1 text-xs leading-5 opacity-75">{message}</p>
        </div>
      </div>
    </div>
  );
}

function getMarketingOptInStatus(item) {
  if (!Object.prototype.hasOwnProperty.call(item, "marketing_emails_opt_in")) {
    return {
      value: null,
      label: "Unknown",
      className: "bg-slate-100 text-slate-600"
    };
  }

  const rawValue = item.marketing_emails_opt_in;
  const optedIn = rawValue === true || String(rawValue).toLowerCase() === "true";

  return optedIn
    ? { value: true, label: "Yes", className: "bg-[#E4F7F3] text-[#0F8F83]" }
    : { value: false, label: "No", className: "bg-slate-100 text-slate-600" };
}

async function exportCsvFile(filename, rows) {
  const headers = Object.keys(rows[0] || {});
  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(","))
  ].join("\r\n");
  const csvWithBom = `\uFEFF${csv}`;

  if (Capacitor.isNativePlatform?.()) {
    const result = await Filesystem.writeFile({
      path: `vetlearn-exports/${filename}`,
      data: csvWithBom,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true
    });

    const canShare = await Share.canShare().catch(() => ({ value: false }));
    if (canShare.value) {
      await Share.share({
        title: "VetLearn email export",
        text: "CSV export from VetLearn.",
        url: result.uri,
        files: [result.uri],
        dialogTitle: "Save or share CSV"
      });
      return;
    }
  }

  const blob = new Blob([csvWithBom], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function penceToPounds(value) {
  const pence = Number(value || 0);
  return Number.isFinite(pence) ? (pence / 100).toFixed(2) : "0.00";
}

function poundsToPence(value) {
  const pounds = Number(value || 0);
  return Number.isFinite(pounds) ? Math.round(pounds * 100) : 0;
}

function StatusBadge({ status }) {
  const inactive = status && status !== "active";
  const label = status || "active";
  return (
    <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black capitalize ${inactive ? "bg-amber-100 text-amber-700" : "bg-[#E4F7F3] text-[#0F8F83]"}`}>
      {label}
    </span>
  );
}

function groupAdminMessages(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const title = row.title || "Admin announcement";
    const body = row.message || "";
    const bucket = row.related_id || `${title}|${body}|${new Date(row.created_at).toISOString().slice(0, 16)}`;
    const existing = groups.get(bucket) || { key: bucket, title, body, createdAt: row.created_at, count: 0, unreadCount: 0, ids: [] };
    existing.count += 1;
    if (!row.is_read) existing.unreadCount += 1;
    existing.ids.push(row.id);
    if (new Date(row.created_at) > new Date(existing.createdAt)) existing.createdAt = row.created_at;
    groups.set(bucket, existing);
  });
  return [...groups.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getUserType(item) {
  if (item.user_type) return item.user_type;
  if (internalAdminTypes.includes(item.role)) return item.role;
  if (["free", "clinician", "professional", "premium"].includes(item.subscription_tier)) return item.subscription_tier;
  if (item.subscription_tier === "enterprise") return "premium";
  if (item.role === "clinician") return "clinician";
  return "free";
}

function roleDescription(type) {
  if (type === "super_admin") return "Full internal control. Can assign or remove Admin and Super Admin roles.";
  if (type === "admin") return "Internal admin access. Can manage users and features, but cannot change protected admin roles.";
  if (type === "premium") return "Highest normal user tier for paid feature access.";
  if (type === "professional") return "Professional user tier for advanced clinical and workflow features.";
  if (type === "clinician") return "Clinician tier for clinical tools and everyday practice features.";
  return "Default account type for new users unless another plan or role is set.";
}

function normaliseAdminStats(raw = {}) {
  const users = raw.users || {};
  const learning = raw.learning || {};
  const system = raw.system || {};
  const community = raw.community || {};

  return {
    totalUsers: numericStat(raw.total_users ?? users.total),
    activeUsers: numericStat(raw.active_users ?? users.active),
    suspendedUsers: numericStat(raw.suspended_users ?? users.suspended),
    admins: numericStat(raw.admins ?? users.admins),
    newWeek: numericStat(raw.new_week ?? users.new_week),
    cpdEntries: numericStat(raw.cpd_entries ?? learning.cpd_entries),
    caseLogs: numericStat(raw.case_logs ?? learning.case_logs),
    protocols: numericStat(raw.protocols ?? learning.protocols),
    posts: numericStat(raw.posts ?? community.posts),
    messages: numericStat(raw.messages ?? system.messages_sent ?? community.messages),
    connections: numericStat(raw.connections ?? community.connections),
    byRole: normaliseBreakdown(raw.users_by_role ?? users.by_role),
    byTier: normaliseBreakdown(raw.users_by_tier ?? users.by_tier),
    missingObjects: Array.isArray(raw.missing_objects) ? raw.missing_objects : []
  };
}

function numericStat(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normaliseBreakdown(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => ({
        label: item.label ?? item.role ?? item.tier ?? item.name,
        count: numericStat(item.count ?? item.total)
      }))
      .filter(item => item.label && Number.isFinite(item.count));
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([label, count]) => ({ label, count: numericStat(count) }))
      .filter(item => Number.isFinite(item.count));
  }
  return [];
}

function formatAdminDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-GB");
}

function getStatsErrorMessage(error) {
  if (isMissingRpcError(error)) {
    return "The admin_dashboard_stats function is missing. Run supabase/admin_dashboard_reliability_fix.sql in the Supabase SQL Editor.";
  }
  if (error?.code === "42P01" || /relation .* does not exist/i.test(error?.message || "")) {
    return `${error.message}. Run supabase/admin_dashboard_reliability_fix.sql so optional activity tables no longer break all overview stats.`;
  }
  return error?.message || "Supabase did not return the overview statistics.";
}

function getUsersErrorMessage(error) {
  if (error?.code === "42P01" || error?.code === "PGRST205" || /admin_user_overview/i.test(error?.message || "")) {
    return "The admin_user_overview view is missing or unavailable. Run the admin dashboard SQL setup in Supabase.";
  }
  return error?.message || "Supabase did not return the user list.";
}

function isMissingRpcError(error) {
  return error?.code === "42883" || error?.code === "PGRST202" || /function .* does not exist/i.test(error?.message || "");
}

async function getAdminActionErrorMessage(error, data) {
  if (data?.error) {
    const suffix = [data.code, data.details, data.hint].filter(Boolean).join(" | ");
    return suffix ? `${data.error} (${suffix})` : data.error;
  }

  const response = error?.context;
  if (response) {
    try {
      const body = await response.clone().json();
      if (body?.error) {
        const suffix = [body.code, body.details, body.hint].filter(Boolean).join(" | ");
        return suffix ? `${body.error} (${suffix})` : body.error;
      }
    } catch {
      // Some Edge Function failures return plain text rather than JSON.
    }
    try {
      const text = await response.clone().text();
      if (text) return text;
    } catch {
      // Fall back to the SDK error message below.
    }
  }

  const message = error?.message || "";
  if (/failed to send a request to the edge function/i.test(message)) return "Admin action service is unavailable. Deploy admin-user-actions in Supabase, then try again.";
  if (/edge function returned a non-2xx status code/i.test(message)) return "The admin delete service returned an error. Check the admin-user-actions function logs in Supabase for the exact table or constraint, then try again.";
  return message || "Could not complete admin action";
}
