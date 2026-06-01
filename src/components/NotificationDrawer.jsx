import { useEffect, useMemo, useState } from "react";
import { X, Check, Trash2, Bell, MessageSquare, Share2, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../supabaseClient";

export default function NotificationDrawer({ 
  isOpen, 
  onClose, 
  notifications, 
  setNotifications, 
  darkMode 
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("unread");
  const [readNotifications, setReadNotifications] = useState([]);

  useEffect(() => {
    if (isOpen) loadReadNotifications();
  }, [isOpen]);

  const loadReadNotifications = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("is_read", true)
      .order("created_at", { ascending: false })
      .limit(50);

    setReadNotifications(data || []);
  };

  const unreadNotifications = useMemo(() => notifications.filter(n => !n.is_read), [notifications]);
  const visibleNotifications = activeTab === "unread" ? unreadNotifications : readNotifications;
  
  const markAsRead = async (notification) => {
    if (notification.is_read) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notification.id);
      
    if (!error) {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      setReadNotifications(prev => [{ ...notification, is_read: true }, ...prev]);
      window.dispatchEvent(new Event("notificationsUpdated"));
      toast.success("Marked as read");
    } else {
      toast.error("Failed to update notification");
    }
  };

  const markAllRead = async () => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("is_read", false);

    if (!error) {
      setReadNotifications(prev => [...notifications.map(n => ({ ...n, is_read: true })), ...prev]);
      setNotifications([]);
      window.dispatchEvent(new Event("notificationsUpdated"));
      toast.success("All marked as read");
    }
  };

  const deleteNotification = async (notification) => {
    const { error } = await supabase.from("notifications").delete().eq("id", notification.id);
    if (!error) {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      setReadNotifications(prev => prev.filter(n => n.id !== notification.id));
      window.dispatchEvent(new Event("notificationsUpdated"));
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      await markAsRead(notification);
    }
    onClose();

    switch (notification.type) {
      case "message":
        navigate("/messages"); 
        break;
      case "connection_request":
      case "connection_accepted":
        navigate("/network");
        break;
      case "shared_cpd":
        navigate("/cpd");
        break;
      case "shared_caselog":
        navigate("/caselogs");
        break;
      default:
        break;
    }
  };

  const getIcon = (type) => {
    switch(type) {
      case "message": return <MessageSquare size={16} />;
      case "share": return <Share2 size={16} />;
      case "connection_request":
      case "connection_accepted": return <UserPlus size={16} />;
      default: return <Bell size={16} />;
    }
  };

  const tabClass = (tab) => `px-3 py-2 rounded-full text-xs font-bold transition ${
    activeTab === tab
      ? "bg-[#71CFC2] text-[#062F63]"
      : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"
  }`;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`fixed inset-y-0 right-0 z-[70] w-full max-w-sm shadow-2xl p-6 overflow-y-auto ${darkMode ? "bg-[#071A24] border-l border-white/10 text-white" : "bg-white border-l border-slate-200 text-[#113247]"}`}>
        <div className="flex justify-between items-center mb-5 border-b pb-4 border-slate-200 dark:border-white/10">
          <h2 className="text-xl font-black">Notifications</h2>
          <div className="flex gap-2">
            {activeTab === "unread" && unreadNotifications.length > 0 && (
              <button onClick={markAllRead} className="text-xs font-bold opacity-70 hover:opacity-100 transition-opacity">Read All</button>
            )}
            <button onClick={onClose} className="opacity-70 hover:opacity-100 transition-opacity"><X size={24} /></button>
          </div>
        </div>

        <div className="flex gap-2 mb-5">
          <button onClick={() => setActiveTab("unread")} className={tabClass("unread")}>Unread</button>
          <button onClick={() => setActiveTab("read")} className={tabClass("read")}>Read</button>
        </div>

        <div className="flex flex-col gap-3">
          {visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center opacity-50 py-10 gap-2">
              <Bell size={32} />
              <p className="text-sm">{activeTab === "unread" ? "No unread notifications" : "No read notifications"}</p>
            </div>
          ) : (
            visibleNotifications.map((notification) => (
              <div 
                key={notification.id} 
                onClick={() => handleNotificationClick(notification)}
                className={`p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-95 ${
                  notification.is_read
                    ? darkMode ? "bg-white/5 border-white/10" : "bg-white border-slate-200"
                    : darkMode ? "bg-[#113247] border-[#71CFC2]/50 shadow-[0_0_15px_rgba(113,207,194,0.15)]" : "bg-[#E8F8F5] border-[#71CFC2]/50 shadow-sm"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-[#0F8F83] dark:text-[#71CFC2]">
                    {getIcon(notification.type)}
                    {notification.title || "Notification"}
                  </div>
                  <div className="flex gap-2 ml-2">
                    {!notification.is_read && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); markAsRead(notification); }} 
                        className="p-1 text-[#0F8F83] dark:text-[#71CFC2] hover:bg-black/5 dark:hover:bg-white/10 rounded"
                        title="Mark as read"
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteNotification(notification); }} 
                      className="p-1 opacity-50 hover:opacity-100 hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-all"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="text-sm opacity-80 mb-3">{notification.message}</div>
                <div className="text-[10px] opacity-50 font-medium">
                  {new Date(notification.created_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
