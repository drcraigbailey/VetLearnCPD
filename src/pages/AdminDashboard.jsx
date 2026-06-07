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
  additional_calculators: "Additional Calculators",
  clinical_protocols: "Clinical Protocols",
  drug_database: "Drug Database",
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
      console.error("Admin delete user failed", error);
      toast.error(await getAdminActionErrorMessage(error));
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
      {activeTab === "audit" && <AdminActivityExplorer darkMode={darkMode} />}
      {activeTab === "settings" && <AdminSettings panelClass={panelClass} />}
    </div>
  );
}

function Overview({ stats, panelClass, darkMode, onRefresh }) {
  const metrics = [
    ["Total users", stats?.total_users],
    ["Active users", stats?.active_users],
    ["CPD entries", stats?.cpd_entries],
    ["Case logs", stats?.case_logs],
    ["Messages", stats?.messages],
    ["Connections", stats?.connections]
  ];

  const chartData = metrics.map(([name, value]) => ({ name, value: value || 0 }));

  return (
    <section className={panelClass}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-black">Overview</h2>
        <button onClick={onRefresh} className={`rounded-lg px-3 py-2 text-sm font-bold flex items-center gap-2 ${darkMode ? "bg-white/10" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      <MetricGrid metrics={metrics} darkMode={darkMode} />
      <div className="h-64 mt-5">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#71CFC2" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function UsersPanel({ panelClass, darkMode, users, query, setQuery, onStatus, onDelete, onUserType, currentUserId, isSuperAdmin, working }) {
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  return (
    <section className={panelClass}>
      <div className="flex items-center gap-2 mb-4">
        <Search size={18} className="opacity-50" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search users" className={`w-full rounded-lg p-3 outline-none ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`} />
      </div>
      <div className="space-y-3">
        {users.map(item => (
          <div key={item.user_id} className={`rounded-lg p-4 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black">{item.full_name || item.email}</h3>
                <p className="text-sm opacity-65">{item.email}</p>
                <p className="text-xs font-bold mt-1 text-[#0F8F83]">{userTypeLabels[getUserType(item)] || getUserType(item)}</p>
              </div>
              <select disabled={working} value={getUserType(item)} onChange={event => onUserType(item, event.target.value)} className={`rounded-lg p-2 text-xs font-bold ${darkMode ? "bg-[#071A24]" : "bg-white"}`}>
                {userTypeOptions.map(type => <option key={type} value={type}>{userTypeLabels[type]}</option>)}
              </select>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button disabled={working || item.account_status === "active"} onClick={() => onStatus(item, "active")} className="rounded-lg bg-[#71CFC2] p-2 text-xs font-black text-[#062F63] disabled:opacity-40">Activate</button>
              <button disabled={working || item.account_status === "suspended"} onClick={() => onStatus(item, "suspended")} className="rounded-lg bg-orange-500 p-2 text-xs font-black text-white disabled:opacity-40">Suspend</button>
              <button
                disabled={working || !isSuperAdmin || item.user_id === currentUserId}
                onClick={() => setDeleteCandidate(item)}
                className="col-span-2 rounded-lg bg-red-600 p-2 text-xs font-black text-white disabled:opacity-40"
              >
                Delete user
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleteCandidate && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 px-4 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${darkMode ? "bg-[#071A24] border-white/10 text-white" : "bg-white border-[#DCEDEA] text-[#113247]"}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl font-black">Delete this user?</h3>
                <p className="mt-2 text-sm opacity-70 leading-6">
                  This will permanently delete <span className="font-black">{deleteCandidate.email}</span> and linked app data. This cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                disabled={working}
                className={`h-9 w-9 rounded-full grid place-items-center shrink-0 ${darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0B3760]"}`}
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                disabled={working}
                className={`rounded-lg p-3 text-sm font-black ${darkMode ? "bg-white/10" : "bg-[#E8F8F5] text-[#0B3760]"}`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={working}
                onClick={async () => {
                  const success = await onDelete(deleteCandidate);
                  if (success) setDeleteCandidate(null);
                }}
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

async function getAdminActionErrorMessage(error) {
  const response = error?.context;
  if (response) {
    try {
      const body = await response.clone().json();
      if (body?.error) {
        const suffix = [body.code, body.details, body.hint].filter(Boolean).join(" | ");
        return suffix ? `${body.error} (${suffix})` : body.error;
      }
    } catch (_jsonError) {}
    try {
      const text = await response.clone().text();
      if (text) return text;
    } catch (_textError) {}
  }

  const message = error?.message || "";
  if (/failed to send a request to the edge function/i.test(message)) {
    return "Admin action service is unavailable. Deploy admin-user-actions in Supabase, then try again.";
  }
  if (/edge function returned a non-2xx status code/i.test(message)) {
    return "The admin delete service returned an error. Check the admin-user-actions function logs in Supabase for the exact table or constraint, then try again.";
  }
  return message || "Could not complete admin action";
}
