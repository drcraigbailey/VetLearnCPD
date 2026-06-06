import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clock, Eye, FileUp, Lock, Network, Search } from "lucide-react";
import { supabase } from "../supabaseClient";

const chartColors = ["#0F8F83", "#71CFC2", "#0B3760", "#F59E0B", "#8B5CF6", "#EF4444", "#64748B", "#14B8A6"];

export default function AdminActivityExplorer({ panelClass, darkMode, users = [], initialLogs = [] }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [setupMissing, setSetupMissing] = useState(false);

  const selectedUser = users.find(item => item.user_id === selectedUserId);
  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users.slice(0, 30);
    return users
      .filter(item => [item.full_name, item.email].filter(Boolean).some(value => String(value).toLowerCase().includes(q)))
      .slice(0, 30);
  }, [userQuery, users]);

  useEffect(() => {
    loadAnalytics();
  }, [selectedUserId]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError("");
    setSetupMissing(false);
    const { data, error: rpcError } = await supabase.rpc("admin_activity_analytics", {
      target_user_id: selectedUserId || null
    });

    if (rpcError) {
      if (import.meta.env.DEV) console.error("admin_activity_analytics failed", rpcError);
      const directResult = await loadDirectActivityFallback(selectedUserId, initialLogs);
      if (directResult.error) {
        if (import.meta.env.DEV) console.error("Direct site analytics fallback failed", directResult.error);
        const missingSetup = isMissingAnalyticsSetup(directResult.error) || isMissingAnalyticsSetup(rpcError);
        setSetupMissing(missingSetup);
        setError(
          missingSetup
            ? "Site Analytics setup is incomplete. Run supabase/site_analytics_setup.sql in the Supabase SQL Editor, then reload this page."
            : "Site Analytics could not be loaded. Check the browser console and Supabase logs for the admin analytics error."
        );
        setAnalytics(buildFallbackAnalytics(initialLogs, selectedUserId));
      } else {
        setError("The analytics RPC is unavailable, so page activity is being shown directly. Run supabase/site_analytics_setup.sql to restore all charts.");
        setAnalytics(directResult.analytics);
      }
      setLoading(false);
      return;
    }

    setAnalytics(normaliseAnalytics(data) || buildFallbackAnalytics(initialLogs, selectedUserId));
    setLoading(false);
  };

  const facts = analytics?.facts || {};
  const sectionUsage = analytics?.section_usage || [];
  const calculatorUsage = analytics?.calculator_usage || [];
  const auditCategoryUsage = analytics?.audit_category_usage || [];
  const auditLogs = analytics?.audit_logs || [];
  const pageVisits = analytics?.page_visits || [];
  const timeBySection = analytics?.time_by_section || [];
  const fileUploadsByContext = analytics?.file_uploads_by_context || [];
  const hasRecordedAnalytics = Number(facts.page_visits || 0) > 0
    || Number(facts.file_uploads || 0) > 0
    || Number(facts.audit_events || 0) > 0
    || sectionUsage.some(item => Number(item.value || 0) > 0);

  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-xl font-black">Site Analytics</h2>
            <p className="text-sm opacity-60">View pages, time spent, uploads, networks and audit activity.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0F8F83]"}`}>
            {selectedUser ? "Individual" : "All users"}
          </span>
        </div>

        <label className={`flex items-center gap-2 rounded-lg px-3 py-3 mb-3 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
          <Search size={18} className="opacity-55" />
          <input
            value={userQuery}
            onChange={(event) => setUserQuery(event.target.value)}
            placeholder="Search users by name or email..."
            className="bg-transparent outline-none flex-1 text-sm"
          />
        </label>

        <select
          value={selectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
          className={`w-full rounded-lg p-3 text-sm font-bold outline-none ${darkMode ? "bg-[#071A24] border border-white/10" : "bg-white border border-[#DCEDEA]"}`}
        >
          <option value="">All users</option>
          {filteredUsers.map(item => (
            <option key={item.user_id} value={item.user_id}>
              {item.full_name || "Unnamed user"} - {item.email}
            </option>
          ))}
        </select>

        {selectedUser && (
          <div className={`mt-3 rounded-lg p-3 text-sm ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
            <p className="font-black">{selectedUser.full_name || "Unnamed user"}</p>
            <p className="opacity-60 truncate">{selectedUser.email}</p>
          </div>
        )}

        {error && (
          <div className={`mt-3 rounded-lg border p-3 text-xs font-bold leading-5 ${setupMissing ? "border-orange-300/40 text-orange-500" : darkMode ? "border-white/10 bg-white/5 text-slate-200" : "border-[#DCEDEA] bg-[#F9FCFB] text-[#113247]"}`}>
            {error}
          </div>
        )}
        {loading && <p className="mt-3 text-sm opacity-60">Loading analytics...</p>}
      </section>

      {!loading && !error && !hasRecordedAnalytics && (
        <section className={panelClass}>
          <div className="py-8 text-center">
            <Eye className="mx-auto mb-3 opacity-35" size={28} />
            <h2 className="font-black text-lg">No site analytics recorded yet</h2>
            <p className="mt-1 text-sm opacity-60 leading-6">Navigate around the app while signed in, then return here after a few page changes.</p>
          </div>
        </section>
      )}

      <section className={panelClass}>
        <h2 className="text-xl font-black mb-4">Site Facts</h2>
        <div className="grid grid-cols-2 gap-3">
          <FactCard darkMode={darkMode} icon={<Eye size={18} />} label="Pages visited" value={facts.page_visits || 0} />
          <FactCard darkMode={darkMode} icon={<Clock size={18} />} label="Time spent" value={formatDuration(facts.total_time_seconds || 0)} />
          <FactCard darkMode={darkMode} icon={<FileUp size={18} />} label="Files uploaded" value={facts.file_uploads || 0} subValue={formatBytes(facts.uploaded_bytes || 0)} />
          <FactCard darkMode={darkMode} icon={<Network size={18} />} label="Network links" value={facts.network_connections || 0} />
          <FactCard darkMode={darkMode} label="Messages" value={facts.messages || 0} />
          <FactCard darkMode={darkMode} label="Audit events" value={facts.audit_events || auditLogs.length} />
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-black">Section Use</h2>
            <p className="text-sm opacity-60">{selectedUser ? selectedUser.full_name || selectedUser.email : "Whole application"}</p>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={sectionUsage} dataKey="value" nameKey="name" innerRadius={55} outerRadius={92} paddingAngle={3}>
                {sectionUsage.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ChartLegend items={sectionUsage} darkMode={darkMode} />
      </section>

      <section className={panelClass}>
        <h2 className="text-xl font-black mb-4">Pages Visited</h2>
        <BarPanel data={pageVisits} darkMode={darkMode} empty="No page visits recorded yet." />
      </section>

      <section className={panelClass}>
        <h2 className="text-xl font-black mb-4">Time By Section</h2>
        <BarPanel data={timeBySection} darkMode={darkMode} empty="Time tracking will appear after the updated activity SQL and tracker are active." formatter={formatDuration} />
      </section>

      <section className={panelClass}>
        <h2 className="text-xl font-black mb-4">Clinical Tools Use</h2>
        <BarPanel data={calculatorUsage} darkMode={darkMode} empty="No calculator use recorded yet." />
      </section>

      <section className={panelClass}>
        <h2 className="text-xl font-black mb-4">File Uploads</h2>
        <BarPanel data={fileUploadsByContext} darkMode={darkMode} empty="No file uploads recorded yet." />
      </section>

      <section className={panelClass}>
        <h2 className="text-xl font-black mb-4">Audit Mix</h2>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={auditCategoryUsage} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={3}>
                {auditCategoryUsage.map((entry, index) => <Cell key={entry.name} fill={chartColors[(index + 2) % chartColors.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ChartLegend items={auditCategoryUsage} darkMode={darkMode} />
      </section>

      <AuditTrail panelClass={panelClass} logs={auditLogs} darkMode={darkMode} selectedUser={selectedUser} />
    </div>
  );
}

function FactCard({ darkMode, icon, label, value, subValue }) {
  return (
    <div className={`rounded-lg p-3 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
      <div className="flex items-center gap-2 text-[#0F8F83] mb-2">
        {icon}
        <span className="text-xs font-black uppercase tracking-wide opacity-75">{label}</span>
      </div>
      <p className="text-xl font-black truncate">{value}</p>
      {subValue && <p className="text-xs opacity-60 mt-1">{subValue}</p>}
    </div>
  );
}

function BarPanel({ data, empty, formatter }) {
  if (!data.length) return <p className="text-sm opacity-60">{empty}</p>;

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => formatter ? formatter(value) : value} />
          <Bar dataKey="value" fill="#0F8F83" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AuditTrail({ panelClass, logs, darkMode, selectedUser }) {
  const detailClass = darkMode ? "bg-white/10 text-slate-200" : "bg-white text-[#0B3760]";

  return (
    <section className={panelClass}>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-black">Audit Trail</h2>
          <p className="text-sm opacity-60">{selectedUser ? `Activity involving ${selectedUser.full_name || selectedUser.email}` : "Recent admin actions, changes and announcements."}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0F8F83]"}`}>
          {logs.length} events
        </span>
      </div>
      <div className={`rounded-lg border overflow-hidden ${darkMode ? "border-white/10 bg-black/10" : "border-[#DCEDEA] bg-white"}`}>
        {logs.map(log => (
          <div key={log.id} className={`p-4 ${darkMode ? "border-b border-white/10 last:border-b-0" : "border-b border-[#DCEDEA] last:border-b-0"}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-1 h-9 w-9 rounded-lg grid place-items-center shrink-0 ${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0F8F83]"}`}>
                <Eye size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black">{formatAction(log.action)}</h3>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${actionBadgeClass(log.action, darkMode)}`}>
                    {actionCategory(log.action)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
                  <span>{formatDateTime(log.created_at)}</span>
                  {log.target_user_id && <span>Target {shortId(log.target_user_id)}</span>}
                  {log.admin_user_id && <span>Admin {shortId(log.admin_user_id)}</span>}
                </div>
                <AuditDetails details={log.details} detailClass={detailClass} />
              </div>
            </div>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="p-6 text-center">
            <Lock className="mx-auto mb-3 opacity-40" size={24} />
            <p className="text-sm opacity-60">No audit activity has been recorded yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ChartLegend({ items, darkMode }) {
  if (!items.length) return <p className="text-sm opacity-60">No activity recorded yet.</p>;
  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {items.map((item, index) => (
        <div key={item.name} className={`rounded-lg p-2 text-xs font-bold flex items-center gap-2 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
          <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
          <span className="truncate">{item.name}</span>
          <span className="ml-auto opacity-60">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function AuditDetails({ details, detailClass }) {
  const entries = Object.entries(details || {}).filter(([, value]) => value !== null && value !== undefined && value !== "");

  if (entries.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {entries.map(([key, value]) => (
        <span key={key} className={`rounded-lg px-3 py-2 text-xs font-bold ${detailClass}`}>
          <span className="opacity-55">{formatDetailLabel(key)}:</span> {formatDetailValue(value)}
        </span>
      ))}
    </div>
  );
}

async function loadDirectActivityFallback(selectedUserId, initialLogs) {
  let activityQuery = supabase
    .from("site_activity_events")
    .select("user_id,path,title,section,duration_seconds,created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  let uploadQuery = supabase
    .from("file_upload_events")
    .select("user_id,file_size,context,created_at")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (selectedUserId) {
    activityQuery = activityQuery.eq("user_id", selectedUserId);
    uploadQuery = uploadQuery.eq("user_id", selectedUserId);
  }

  const [activityResult, uploadResult] = await Promise.all([activityQuery, uploadQuery]);
  if (activityResult.error) return { error: activityResult.error, analytics: null };
  if (uploadResult.error && !isMissingAnalyticsSetup(uploadResult.error)) return { error: uploadResult.error, analytics: null };

  const activityRows = activityResult.data || [];
  const uploadRows = uploadResult.data || [];
  const scopedLogs = selectedUserId
    ? initialLogs.filter(log => log.target_user_id === selectedUserId || log.admin_user_id === selectedUserId)
    : initialLogs;
  const pageVisits = groupCounts(activityRows.map(row => row.title || row.path || "Unknown page"));
  const timeBySection = groupSums(activityRows, row => row.section || "Other", row => Number(row.duration_seconds || 0));
  const fileUploadsByContext = groupCounts(uploadRows.map(row => row.context || "General"));
  const sectionUsage = groupCounts(activityRows.map(row => row.section || "Other"));

  return {
    error: null,
    analytics: {
      facts: {
        page_visits: activityRows.length,
        total_time_seconds: activityRows.reduce((sum, row) => sum + Number(row.duration_seconds || 0), 0),
        file_uploads: uploadRows.length,
        uploaded_bytes: uploadRows.reduce((sum, row) => sum + Number(row.file_size || 0), 0),
        network_connections: 0,
        messages: 0,
        audit_events: scopedLogs.length
      },
      section_usage: sectionUsage,
      calculator_usage: [],
      audit_category_usage: groupCounts(scopedLogs.map(log => actionCategory(log.action))),
      page_visits: pageVisits,
      time_by_section: timeBySection,
      file_uploads_by_context: fileUploadsByContext,
      audit_logs: scopedLogs
    }
  };
}

function normaliseAnalytics(data) {
  if (!data || typeof data !== "object") return null;
  return {
    facts: data.facts || {},
    section_usage: Array.isArray(data.section_usage) ? data.section_usage : [],
    calculator_usage: Array.isArray(data.calculator_usage) ? data.calculator_usage : [],
    audit_category_usage: Array.isArray(data.audit_category_usage) ? data.audit_category_usage : [],
    page_visits: Array.isArray(data.page_visits) ? data.page_visits : [],
    time_by_section: Array.isArray(data.time_by_section) ? data.time_by_section : [],
    file_uploads_by_context: Array.isArray(data.file_uploads_by_context) ? data.file_uploads_by_context : [],
    audit_logs: Array.isArray(data.audit_logs) ? data.audit_logs : []
  };
}

function isMissingAnalyticsSetup(error) {
  const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return message.includes("42p01")
    || message.includes("42883")
    || message.includes("pgrst202")
    || message.includes("does not exist")
    || message.includes("could not find the function")
    || message.includes("schema cache");
}

function groupSums(rows, nameGetter, valueGetter) {
  const totals = rows.reduce((acc, row) => {
    const name = nameGetter(row) || "Other";
    acc[name] = (acc[name] || 0) + Number(valueGetter(row) || 0);
    return acc;
  }, {});
  return Object.entries(totals)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

function buildFallbackAnalytics(logs, selectedUserId) {
  const scopedLogs = selectedUserId
    ? logs.filter(log => log.target_user_id === selectedUserId || log.admin_user_id === selectedUserId)
    : logs;

  return {
    facts: {
      page_visits: 0,
      total_time_seconds: 0,
      file_uploads: 0,
      uploaded_bytes: 0,
      network_connections: 0,
      audit_events: scopedLogs.length
    },
    section_usage: [
      { name: "Audit events", value: scopedLogs.length }
    ],
    calculator_usage: [],
    audit_category_usage: groupCounts(scopedLogs.map(log => actionCategory(log.action))),
    page_visits: [],
    time_by_section: [],
    file_uploads_by_context: [],
    audit_logs: scopedLogs
  };
}

function groupCounts(values) {
  const counts = values.reduce((acc, value) => {
    const label = value || "Other";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function formatAction(action = "") {
  return action
    .split("_")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "Audit event";
}

function actionCategory(action = "") {
  if (action.includes("role")) return "Role";
  if (action.includes("feature")) return "Feature";
  if (action.includes("announcement")) return "Message";
  if (action.includes("suspended") || action.includes("active") || action.includes("delete")) return "Account";
  return "System";
}

function actionBadgeClass(action, darkMode) {
  const category = actionCategory(action);
  if (category === "Role") return darkMode ? "bg-purple-400/20 text-purple-100" : "bg-purple-100 text-purple-700";
  if (category === "Feature") return darkMode ? "bg-cyan-400/20 text-cyan-100" : "bg-cyan-100 text-cyan-700";
  if (category === "Message") return darkMode ? "bg-amber-400/20 text-amber-100" : "bg-amber-100 text-amber-700";
  if (category === "Account") return darkMode ? "bg-rose-400/20 text-rose-100" : "bg-rose-100 text-rose-700";
  return darkMode ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-600";
}

function formatDetailLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatDetailValue(value) {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDateTime(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function shortId(value) {
  if (!value) return "";
  return String(value).slice(0, 8);
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (value < 60) return `${value}s`;
  const minutes = Math.round(value / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
