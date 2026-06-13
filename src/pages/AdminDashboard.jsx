import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  Crown,
  Database,
  Flag,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users
} from "lucide-react";
import toast from "react-hot-toast";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AdminActivityExplorer from "../components/AdminActivityExplorer";
import LoadingState from "../components/LoadingState";
import PageBanner from "../components/PageBanner";
import AppPopup, { popupPresets } from "../components/AppPopup";
import { supabase } from "../supabaseClient";

const adminTabs = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "users", label: "Users", icon: Users },
  { id: "permissions", label: "Permissions", icon: ShieldCheck },
  { id: "features", label: "Features", icon: Flag },
  { id: "subscriptions", label: "Subscriptions", icon: Crown },
  { id: "messaging", label: "Messaging", icon: MessageSquare },
  { id: "audit", label: "Site Analytics", icon: Lock },
  { id: "settings", label: "Settings", icon: Settings }
];

const featureLabels = {
  clinical_tools: "Clinical Tools",
  drug_calculator: "Drug Calculator",
  additional_calculators: "Additional Calculators",
  clinical_protocols: "Clinical Protocols",
  drug_database: "Drug Database",
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

export default function AdminDashboard({ user, darkMode }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [adminRole, setAdminRole] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [featureMatrix, setFeatureMatrix] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [adminMessages, setAdminMessages] = useState([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState({ title: "", body: "", audience: "all" });
  const [working, setWorking] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [usersError, setUsersError] = useState("");

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

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

    const [statsRes, usersRes, subRes, adminMessagesRes] = await Promise.all([
      supabase.rpc("admin_dashboard_stats"),
      supabase.from("admin_user_overview").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("subscription_plans").select("*").order("sort_order", { ascending: true }),
      supabase
        .from("notifications")
        .select("id, title, message, type, is_read, created_at, related_id")
        .eq("type", "admin_announcement")
        .order("created_at", { ascending: false })
        .limit(500)
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
      const fallback = await supabase
        .from("subscription_feature_access")
        .select("*")
        .order("subscription_tier", { ascending: true });
      setFeatureMatrix((fallback.data || []).map(item => ({
        user_type: item.subscription_tier,
        feature_key: item.feature_key,
        is_enabled: item.is_enabled,
        updated_at: item.updated_at,
        updated_by: item.updated_by
      })));
    }
    if (!subRes.error) setSubscriptions(subRes.data || []);
    else console.error("Admin subscriptions failed to load", subRes.error);

    setLoading(false);
  };

  useEffect(() => {
    if (!user?.id) return;
    // Loading remote admin data is the external synchronization performed here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAdminData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(item =>
      [item.full_name, item.email, getUserType(item), item.role, item.subscription_tier, item.account_status]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    );
  }, [query, users]);

  const isSuperAdmin = adminRole === "super_admin";

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
        badges={[{ label: adminRole === "super_admin" ? "Super Admin" : "Admin", icon: <ShieldCheck size={14} />, accent: true }]}
      />

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {adminTabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-full px-4 py-3 text-sm font-black flex items-center gap-2 ${
                active ? "bg-[#71CFC2] text-[#062F63] shadow-lg" : darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0B3760]"
              }`}
            >
              <Icon size={16} />
              {tab.label}
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
        />
      )}
      {activeTab === "permissions" && <PermissionsPanel panelClass={panelClass} darkMode={darkMode} isSuperAdmin={isSuperAdmin} />}
      {activeTab === "features" && <FeaturesPanel panelClass={panelClass} darkMode={darkMode} matrix={featureMatrix} onToggle={toggleUserTypeFeature} working={working} />}
      {activeTab === "subscriptions" && <SubscriptionsPanel panelClass={panelClass} darkMode={darkMode} subscriptions={subscriptions} />}
      {activeTab === "messaging" && <MessagingPanel panelClass={panelClass} darkMode={darkMode} message={message} setMessage={setMessage} onSend={sendAdminMessage} working={working} history={adminMessages} onDeleteHistory={deleteAdminMessage} />}
      {activeTab === "audit" && <AdminActivityExplorer darkMode={darkMode} />}
      {activeTab === "settings" && <AdminSettings panelClass={panelClass} />}
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

function UsersPanel({ panelClass, darkMode, users, query, setQuery, onStatus, onDelete, onUserType, currentUserId, isSuperAdmin, working, error }) {
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  return (
    <section className={panelClass}>
      <div className={`mb-5 flex items-center gap-2 rounded-2xl border px-4 ${darkMode ? "border-white/10 bg-white/10" : "border-[#D6E9E6] bg-[#F2F8F7]"}`}>
        <Search size={18} className="opacity-50" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search users" className="w-full bg-transparent py-3.5 outline-none" />
      </div>
      {error && <AdminDataNotice title="Users could not be loaded" message={error} darkMode={darkMode} />}
      <div className="space-y-5">
        {users.map(item => (
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
        ))}
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

function SubscriptionsPanel({ panelClass, darkMode, subscriptions }) {
  return (
    <section className={panelClass}>
      <h2 className="text-xl font-black mb-3">Subscription Foundation</h2>
      <p className="text-sm opacity-65 leading-6 mb-4">Paid plan records remain separate from Admin and Super Admin permission roles.</p>
      <div className="space-y-3">
        {subscriptions.map(plan => (
          <div key={plan.tier} className={`rounded-lg p-4 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
            <div className="flex items-center justify-between gap-3"><h3 className="font-black capitalize">{plan.name}</h3><span className="text-xs font-black text-[#0F8F83]">{plan.tier}</span></div>
            <p className="text-sm opacity-65 mt-1">{plan.description || "No description yet."}</p>
          </div>
        ))}
      </div>
    </section>
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
