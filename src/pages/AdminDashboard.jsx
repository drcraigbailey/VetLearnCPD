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
  UserCog,
  Users
} from "lucide-react";
import toast from "react-hot-toast";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AdminActivityExplorer from "../components/AdminActivityExplorer";
import LoadingState from "../components/LoadingState";
import PageBanner from "../components/PageBanner";
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
  clinical_protocols: "Clinical Protocols",
  drug_database: "Drug Database",
  library: "Library",
  case_logs: "Case Logs",
  network: "Network",
  messaging: "Messaging",
  cpd_tracker: "CPD Tracker",
  vault: "Vault",
  ai_assistant: "AI Assistant"
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

export default function AdminDashboard({ user, profile, darkMode }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [adminRole, setAdminRole] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [featureMatrix, setFeatureMatrix] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState({ title: "", body: "", audience: "all" });
  const [working, setWorking] = useState(false);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  useEffect(() => {
    if (!user?.id) return;
    loadAdminData();
  }, [user?.id]);

  const loadAdminData = async () => {
    setLoading(true);

    const roleRes = await supabase
      .from("admin_user_roles")
      .select("role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (roleRes.error || !roleRes.data || !["admin", "super_admin"].includes(roleRes.data.role)) {
      setAdminRole(null);
      setLoading(false);
      return;
    }

    setAdminRole(roleRes.data.role);

    const [statsRes, usersRes, auditRes, subRes] = await Promise.all([
      supabase.rpc("admin_dashboard_stats"),
      supabase.from("admin_user_overview").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("subscription_plans").select("*").order("sort_order", { ascending: true })
    ]);

    const featureRes = await supabase
      .from("user_type_feature_access")
      .select("*")
      .order("user_type", { ascending: true });

    if (!statsRes.error) setStats(statsRes.data || {});
    if (!usersRes.error) setUsers(usersRes.data || []);
    if (!auditRes.error) setAuditLogs(auditRes.data || []);
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

    setLoading(false);
  };

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

    if (error) toast.error("Could not update user status");
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
    const { error } = await supabase.functions.invoke("admin-user-actions", {
      body: {
        action: "delete_user",
        targetUserId: targetUser.user_id,
        email: targetUser.email
      }
    });

    if (error) {
      toast.error(getAdminActionErrorMessage(error));
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
      toast.error(isMissingRpcError(error) ? "Run admin_user_types_notifications.sql first" : error.message || "Could not update user type");
    } else {
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

    if (error) {
      toast.error("Run admin_user_types_notifications.sql first");
    } else {
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

      {activeTab === "overview" && <Overview stats={stats} panelClass={panelClass} darkMode={darkMode} onRefresh={loadAdminData} />}
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
        />
      )}
      {activeTab === "permissions" && <PermissionsPanel panelClass={panelClass} darkMode={darkMode} isSuperAdmin={isSuperAdmin} />}
      {activeTab === "features" && <FeaturesPanel panelClass={panelClass} darkMode={darkMode} matrix={featureMatrix} onToggle={toggleUserTypeFeature} working={working} />}
      {activeTab === "subscriptions" && <SubscriptionsPanel panelClass={panelClass} darkMode={darkMode} subscriptions={subscriptions} />}
      {activeTab === "messaging" && <MessagingPanel panelClass={panelClass} darkMode={darkMode} message={message} setMessage={setMessage} onSend={sendAdminMessage} working={working} />}
      {activeTab === "audit" && <AdminActivityExplorer panelClass={panelClass} darkMode={darkMode} users={users} initialLogs={auditLogs} />}
      {activeTab === "settings" && <AdminSettings panelClass={panelClass} darkMode={darkMode} profile={profile} />}
    </div>
  );
}

function Overview({ stats = {}, panelClass, darkMode, onRefresh }) {
  const userStats = stats?.users || {};
  const learningStats = stats?.learning || {};
  const systemStats = stats?.system || {};
  const chartData = [
    { name: "Users", value: userStats.total || 0 },
    { name: "CPD", value: learningStats.cpd_entries || 0 },
    { name: "Cases", value: learningStats.case_logs || 0 },
    { name: "Protocols", value: learningStats.protocols || 0 },
    { name: "Messages", value: systemStats.messages_sent || 0 }
  ];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={onRefresh} className="rounded-lg bg-[#71CFC2] text-[#062F63] px-4 py-3 text-sm font-black flex items-center gap-2"><RefreshCw size={16} /> Refresh</button>
      </div>
      <section className={panelClass}>
        <h2 className="text-xl font-black mb-4">User Statistics</h2>
        <MetricGrid metrics={[
          ["Total users", userStats.total], ["Active", userStats.active], ["Today", userStats.new_today], ["This week", userStats.new_week],
          ["This month", userStats.new_month], ["Clinicians", userStats.clinician], ["Premium", userStats.premium], ["Suspended", userStats.suspended], ["Admins", userStats.admins]
        ]} darkMode={darkMode} />
      </section>
      <section className={panelClass}>
        <h2 className="text-xl font-black mb-4">Learning Statistics</h2>
        <MetricGrid metrics={[
          ["CPD entries", learningStats.cpd_entries], ["Reading records", learningStats.reading_records], ["Case logs", learningStats.case_logs],
          ["Protocols", learningStats.protocols], ["Calculations", learningStats.calculations], ["Most used tool", learningStats.most_used_tool || "None yet"]
        ]} darkMode={darkMode} />
      </section>
      <section className={panelClass}>
        <h2 className="text-xl font-black mb-4">System Snapshot</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#0F8F83" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <MetricGrid metrics={[
          ["Database records", systemStats.database_records], ["Notifications", systemStats.notifications_sent], ["Messages", systemStats.messages_sent],
          ["Error logs", systemStats.error_logs], ["Last backup", systemStats.last_backup || "Not recorded"]
        ]} darkMode={darkMode} />
      </section>
    </div>
  );
}

function UsersPanel({ panelClass, darkMode, users, query, setQuery, onStatus, onDelete, onUserType, currentUserId, isSuperAdmin, working }) {
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const canConfirmDelete = deleteConfirm.trim().toUpperCase() === "DELETE";

  const closeDeleteWarning = () => {
    setDeleteCandidate(null);
    setDeleteConfirm("");
  };

  const confirmDelete = async () => {
    if (!deleteCandidate || !canConfirmDelete) return;
    const deleted = await onDelete(deleteCandidate);
    if (deleted) closeDeleteWarning();
  };

  return (
    <section className={panelClass}>
      <div className="flex items-start gap-3 mb-4">
        <UserCog className="text-[#0F8F83] shrink-0" />
        <div>
          <h2 className="text-xl font-black">User Management</h2>
          <p className="text-sm opacity-60">Search, suspend, reactivate and manage user type.</p>
        </div>
      </div>
      <label className={`flex items-center gap-2 rounded-lg px-3 py-3 mb-4 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
        <Search size={18} className="opacity-55" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users..." className="bg-transparent outline-none flex-1 text-sm" />
      </label>
      <div className="space-y-3">
        {users.map(item => {
          const userType = getUserType(item);
          const isInternal = internalAdminTypes.includes(userType);
          const canChangeType = isSuperAdmin || !isInternal;
          return (
            <div key={item.user_id} className={`rounded-lg border p-4 ${darkMode ? "border-white/10 bg-black/10" : "border-[#DCEDEA] bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-black truncate">{item.full_name || "Unnamed user"}</h3>
                  <p className="text-sm opacity-65 truncate">{item.email}</p>
                  <p className="text-xs opacity-50 mt-1">Joined {formatDate(item.created_at)} - Last login {formatDate(item.last_sign_in_at)}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${item.account_status === "suspended" ? "bg-red-100 text-red-700" : "bg-[#E8F8F5] text-[#0F8F83]"}`}>{item.account_status || "active"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <label className="block">
                  <span className="text-[10px] font-black uppercase opacity-50">User type</span>
                  <select value={userType} disabled={!canChangeType || working} onChange={(event) => onUserType(item, event.target.value)} className={`mt-1 w-full rounded-lg p-3 text-sm font-bold ${darkMode ? "bg-[#071A24]" : "bg-[#F0F6F5]"}`}>
                    {userTypeOptions.map(option => (
                      <option key={option} value={option} disabled={internalAdminTypes.includes(option) && !isSuperAdmin}>
                        {userTypeLabels[option]}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={working} onClick={() => onStatus(item, item.account_status === "suspended" ? "active" : "suspended")} className="self-end rounded-lg bg-[#71CFC2] text-[#062F63] px-3 py-3 text-sm font-black">
                  {item.account_status === "suspended" ? "Reactivate" : "Suspend"}
                </button>
              </div>
              {isInternal && !isSuperAdmin && <p className="mt-2 text-xs font-bold text-orange-500">Only Super Admins can change admin access.</p>}
              <button
                disabled={working || !isSuperAdmin || item.user_id === currentUserId}
                onClick={() => { setDeleteCandidate(item); setDeleteConfirm(""); }}
                className={`mt-2 w-full rounded-lg px-3 py-3 text-sm font-black flex items-center justify-center gap-2 ${
                  darkMode ? "bg-red-500/15 text-red-200 disabled:bg-white/5 disabled:text-slate-500" : "bg-red-50 text-red-600 disabled:bg-slate-100 disabled:text-slate-400"
                }`}
              >
                <Trash2 size={16} />
                Delete user and data
              </button>
            </div>
          );
        })}
        {users.length === 0 && <p className="text-sm opacity-60">No users found.</p>}
      </div>
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4">
          <div className={`w-full max-w-md rounded-lg border p-5 shadow-2xl ${darkMode ? "border-white/10 bg-[#071A24] text-white" : "border-red-100 bg-white text-[#0B3760]"}`}>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 text-red-600 grid place-items-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black">Delete this user?</h3>
                <p className="mt-1 text-sm opacity-70 leading-6">
                  This permanently deletes the user account and all app data linked to it. This cannot be undone.
                </p>
              </div>
            </div>
            <div className={`mt-4 rounded-lg p-3 text-sm ${darkMode ? "bg-white/10" : "bg-red-50"}`}>
              <p className="font-black truncate">{deleteCandidate.full_name || "Unnamed user"}</p>
              <p className="text-xs opacity-65 truncate">{deleteCandidate.email}</p>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-black opacity-65">Type DELETE to confirm</span>
              <input
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                className={`mt-2 w-full rounded-lg p-3 outline-none text-sm font-black ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}
                autoFocus
              />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={closeDeleteWarning} disabled={working} className={`rounded-lg p-3 text-sm font-black ${darkMode ? "bg-white/10" : "bg-slate-100"}`}>
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={working || !canConfirmDelete}
                className="rounded-lg bg-red-600 p-3 text-sm font-black text-white disabled:bg-slate-300 disabled:text-slate-500"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
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
            <tr className="text-left opacity-60">
              <th className="p-2">Feature</th>
              {userTypeOptions.map(type => <th key={type} className="p-2">{userTypeLabels[type]}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.entries(featureLabels).map(([key, label]) => (
              <tr key={key} className={darkMode ? "border-t border-white/10" : "border-t border-[#DCEDEA]"}>
                <td className="p-2 font-black">{label}</td>
                {userTypeOptions.map(type => (
                  <td key={type} className="p-2">
                    <button disabled={working} onClick={() => onToggle(type, key, !lookup(type, key))} className={`rounded-full px-3 py-1 text-xs font-black ${lookup(type, key) ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"}`}>
                      {lookup(type, key) ? "On" : "Off"}
                    </button>
                  </td>
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
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-black capitalize">{plan.name}</h3>
              <span className="text-xs font-black text-[#0F8F83]">{plan.tier}</span>
            </div>
            <p className="text-sm opacity-65 mt-1">{plan.description || "No description yet."}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MessagingPanel({ panelClass, darkMode, message, setMessage, onSend, working }) {
  return (
    <section className={panelClass}>
      <div className="flex items-start gap-3 mb-4">
        <Mail className="text-[#0F8F83] shrink-0" />
        <div>
          <h2 className="text-xl font-black">Admin Messaging Centre</h2>
          <p className="text-sm opacity-65">Send announcements, maintenance notices and release notes.</p>
        </div>
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
    <div className="grid grid-cols-2 gap-3">
      {metrics.map(([label, value]) => (
        <div key={label} className={`rounded-lg p-3 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
          <div className="text-xl font-black text-[#0F8F83] truncate">{value ?? 0}</div>
          <div className="text-xs font-bold opacity-65">{label}</div>
        </div>
      ))}
    </div>
  );
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

function isMissingRpcError(error) {
  return error?.code === "42883" || error?.code === "PGRST202" || /function .* does not exist/i.test(error?.message || "");
}

function getAdminActionErrorMessage(error) {
  const message = error?.message || "";
  if (/failed to send a request to the edge function/i.test(message)) {
    return "Admin action service is unavailable. Deploy admin-user-actions in Supabase, then try again.";
  }
  return message || "Could not delete user";
}

function formatDate(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString();
}
