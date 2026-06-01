import { useEffect, useMemo, useState } from "react";
import { Bell, Check, Loader2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import PageBanner from "../components/PageBanner";
import { supabase } from "../supabaseClient";

export default function Notifications({ user, darkMode = false }) {
  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState("unread");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!user) return;
    loadNotifications();

    const channel = supabase
      .channel(`notifications-page-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`
      }, () => {
        loadNotifications();
        window.dispatchEvent(new Event("notificationsUpdated"));
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const loadNotifications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load notifications");
    } else {
      setNotifications(data || []);
    }
    setLoading(false);
  };

  const unread = useMemo(() => notifications.filter(item => !item.is_read), [notifications]);
  const read = useMemo(() => notifications.filter(item => item.is_read), [notifications]);
  const visibleNotifications = activeTab === "unread" ? unread : read;

  const markAsRead = async (notification) => {
    if (notification.is_read) return;
    setBusyId(notification.id);
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notification.id)
      .eq("user_id", user.id);

    if (error) {
      toast.error("Could not mark notification as read");
    } else {
      setNotifications(prev => prev.map(item => item.id === notification.id ? { ...item, is_read: true } : item));
      window.dispatchEvent(new Event("notificationsUpdated"));
    }
    setBusyId(null);
  };

  const deleteNotification = async (notification) => {
    setBusyId(notification.id);
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notification.id)
      .eq("user_id", user.id);

    if (error) {
      toast.error("Could not delete notification");
    } else {
      setNotifications(prev => prev.filter(item => item.id !== notification.id));
      window.dispatchEvent(new Event("notificationsUpdated"));
    }
    setBusyId(null);
  };

  const tabClass = (tab) => `px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition ${
    activeTab === tab
      ? "bg-[#71CFC2] text-[#062F63] shadow-md"
      : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"
  }`;

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  return (
    <div className="pb-8">
      <PageBanner
        title="Notifications"
        subtitle="View important updates and activity."
        darkMode={darkMode}
        badges={[{ label: `${unread.length} unread`, icon: <Bell size={13} />, accent: true }]}
      />

      <div className="flex overflow-x-auto gap-2 mb-6 pb-2 scrollbar-hide">
        <button className={tabClass("unread")} onClick={() => setActiveTab("unread")}>Unread</button>
        <button className={tabClass("read")} onClick={() => setActiveTab("read")}>Read</button>
      </div>

      {loading ? (
        <div className={`${panelClass} flex justify-center py-12`}>
          <Loader2 className="animate-spin text-[#71CFC2]" size={28} />
        </div>
      ) : visibleNotifications.length === 0 ? (
        <div className={`${panelClass} text-center text-sm ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
          {activeTab === "unread" ? "No unread notifications." : "No read notifications yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleNotifications.map(notification => (
            <div key={notification.id} className={panelClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`font-black ${darkMode ? "text-white" : "text-[#113247]"}`}>
                    {notification.title || "Notification"}
                  </div>
                  <p className={`text-sm mt-1 leading-6 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                    {notification.message}
                  </p>
                  <div className="text-[11px] opacity-50 mt-3 font-bold">
                    {new Date(notification.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!notification.is_read && (
                    <button
                      onClick={() => markAsRead(notification)}
                      className="h-9 w-9 rounded-lg bg-[#E8F8F5] text-[#0F8F83] grid place-items-center"
                      aria-label="Mark notification as read"
                    >
                      {busyId === notification.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(notification)}
                    className="h-9 w-9 rounded-lg bg-slate-100 text-slate-500 grid place-items-center hover:text-red-500"
                    aria-label="Delete notification"
                  >
                    {busyId === notification.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
