import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Bell, ClipboardList, KeyRound, Lock, LogOut, MessageSquare, Moon, Settings as SettingsIcon, Sun, Users, X } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

import FloatingReadingTimer from "./components/FloatingReadingTimer";
import Navbar from "./components/Navbar";
import NotificationDrawer from "./components/NotificationDrawer";
import { supabase } from "./supabaseClient";
import { authenticateBiometric, isBiometricAvailable, isBiometricEnabled } from "./utils/biometricAuth";

import AuthPage from "./pages/AuthPage";
import CPD from "./pages/CPD";
import Caselogs from "./pages/Caselogs";
import HomeDashboard from "./pages/HomeDashboard";
import Drugs from "./pages/drugs.jsx";
import SettingsPage from "./pages/Settings";
import Network from "./pages/Network";
import Messages from "./pages/Messages";
import NotificationsPage from "./pages/Notifications";
import Protocols from "./pages/Protocols";
import Vault from "./pages/Vault";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const routeLabels = {
  "/cpd": { title: "CPD Portfolio", item_type: "cpd" },
  "/caselogs": { title: "Case Logs", item_type: "case" },
  "/drugs": { title: "Formulary", item_type: "drug" },
  "/network": { title: "Professional Network", item_type: "page" },
  "/messages": { title: "Messages", item_type: "page" },
  "/notifications": { title: "Notifications", item_type: "page" },
  "/protocols": { title: "Clinical Protocols", item_type: "protocol" },
  "/vault": { title: "Vault", item_type: "page" },
  "/settings": { title: "Settings", item_type: "page" }
};

function RecentRouteTracker({ user }) {
  const { pathname } = useLocation();

  useEffect(() => {
    const route = routeLabels[pathname];
    if (!user?.id || !route) return;

    supabase.from("recently_viewed").insert({
      user_id: user.id,
      item_type: route.item_type,
      title: route.title,
      url: pathname,
      metadata: { source: "navigation" }
    }).then(() => {});
  }, [pathname, user?.id]);

  return null;
}

function AppHeader({ darkMode, displayName, unreadNotificationCount, onOpenNotifications, onToggleDarkMode, onSignOut }) {
  const location = useLocation();
  const navigate = useNavigate();
  const showBack = location.pathname !== "/";

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <div className={`sticky top-0 z-40 border-b backdrop-blur-xl ${darkMode ? "border-white/10 bg-[#071A24]/85" : "border-[#DCEDEA] bg-white/85"}`}>
      <div className="max-w-md mx-auto px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {showBack && (
              <button onClick={goBack} className={`h-10 w-10 rounded-full grid place-items-center shrink-0 ${darkMode ? "bg-white/10 text-slate-100" : "bg-[#E8F8F5] text-[#0B3760]"}`} aria-label="Go back">
                <ArrowLeft size={19} />
              </button>
            )}
            <img src="/logo.png" alt="VetLearn CPD" className="w-12 h-12 object-contain shrink-0" />
            <div className="min-w-0">
              <h1 className={`text-xl font-black tracking-normal ${darkMode ? "text-white" : "text-[#113247]"}`}>VetLearn</h1>
              <p className="text-sm text-[#0F8F83] font-semibold truncate">{displayName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onOpenNotifications} className={`relative h-10 w-10 rounded-full grid place-items-center shrink-0 ${darkMode ? "bg-white/10 text-slate-100" : "bg-[#E8F8F5] text-[#0B3760]"}`} aria-label="Open notifications">
              <Bell size={18} />
              {unreadNotificationCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold">{unreadNotificationCount}</span>}
            </button>
            <button onClick={onToggleDarkMode} className={`h-10 w-10 rounded-full grid place-items-center shrink-0 ${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"}`} aria-label="Toggle dark mode">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={onSignOut} className={`h-10 w-10 rounded-full grid place-items-center shrink-0 ${darkMode ? "bg-white/10 text-slate-100" : "bg-[#E8F8F5] text-[#0B3760]"}`} aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BiometricGate({ darkMode, checking, onUnlock, onSignOut }) {
  return (
    <div className={`fixed inset-0 z-[120] grid place-items-center px-5 ${darkMode ? "bg-[#071A24] text-white" : "bg-[#F9FCFB] text-[#113247]"}`}>
      <div className={`w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl ${darkMode ? "bg-white/10 border border-white/10" : "bg-white border border-[#DCEDEA]"}`}>
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-[#E8F8F5] text-[#0B3760] grid place-items-center">
          <Lock size={28} />
        </div>
        <h2 className="text-2xl font-black mb-2">Unlock VetLearn</h2>
        <p className="text-sm opacity-65 leading-6 mb-5">Use this device's fingerprint, Face ID or screen lock to continue.</p>
        <button onClick={onUnlock} disabled={checking} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-4 font-black disabled:opacity-60">
          {checking ? "Checking..." : "Unlock"}
        </button>
        <button onClick={onSignOut} className="mt-4 text-sm font-bold opacity-60">Sign out instead</button>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [savingReading, setSavingReading] = useState(false);
  const [biometricLocked, setBiometricLocked] = useState(false);
  const [biometricChecking, setBiometricChecking] = useState(false);
  const [activeReading, setActiveReading] = useState(() => {
    const saved = localStorage.getItem("vetlearn-active-reading");
    return saved ? JSON.parse(saved) : null;
  });
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("vetlearn-theme") === "dark");

  useEffect(() => {
    localStorage.setItem("vetlearn-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (activeReading) localStorage.setItem("vetlearn-active-reading", JSON.stringify(activeReading));
    else localStorage.removeItem("vetlearn-active-reading");
  }, [activeReading]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const prepareBiometricLock = async () => {
      if (!session?.user) {
        setBiometricLocked(false);
        return;
      }
      if (!isBiometricEnabled(session.user.id)) {
        setBiometricLocked(false);
        return;
      }
      const available = await isBiometricAvailable();
      setBiometricLocked(available);
    };

    prepareBiometricLock();
  }, [session?.user?.id]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!session?.user) {
        setProfile(null);
        setNotifications([]);
        setUnreadNotificationCount(0);
        setUnreadMessageCount(0);
        setPendingRequestCount(0);
        return;
      }

      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      setProfile(data || null);
      loadNotifications();
      loadUnreadMessageCount();
      loadPendingRequestCount();
    };

    loadProfile();
  }, [session]);

  useEffect(() => {
    if (!session?.user) return;

    const refreshNotifications = () => loadNotifications();
    const refreshMessages = () => loadUnreadMessageCount();
    const refreshRequests = () => loadPendingRequestCount();
    const refreshProfile = async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      setProfile(data || null);
    };

    window.addEventListener("notificationsUpdated", refreshNotifications);
    window.addEventListener("messagesUpdated", refreshMessages);
    window.addEventListener("networkUpdated", refreshRequests);
    window.addEventListener("profileUpdated", refreshProfile);

    return () => {
      window.removeEventListener("notificationsUpdated", refreshNotifications);
      window.removeEventListener("messagesUpdated", refreshMessages);
      window.removeEventListener("networkUpdated", refreshRequests);
      window.removeEventListener("profileUpdated", refreshProfile);
    };
  }, [session]);

  useEffect(() => {
    if (!session?.user) return;

    const channel = supabase
      .channel(`app-badges-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${session.user.id}` }, (payload) => {
        if (payload.eventType === "INSERT" && !payload.new.is_read) toast.success(payload.new.message || "New notification");
        loadNotifications();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        loadUnreadMessageCount();
        loadNotifications();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, () => loadPendingRequestCount())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [session]);

  useEffect(() => {
    setUnreadNotificationCount(notifications.filter(notification => !notification.is_read).length);
  }, [notifications]);

  const clearReadMessageNotifications = async (unreadItems) => {
    const messageNotifications = unreadItems.filter(item => item.type === "message" && item.related_id);
    if (messageNotifications.length === 0) return unreadItems;

    const ids = messageNotifications.map(item => item.related_id);
    const { data } = await supabase
      .from("messages")
      .select("id, is_read")
      .in("id", ids);

    const readMessageIds = (data || []).filter(message => message.is_read).map(message => String(message.id));
    if (readMessageIds.length === 0) return unreadItems;

    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", session.user.id)
      .eq("type", "message")
      .in("related_id", readMessageIds);

    return unreadItems.filter(item => !(item.type === "message" && readMessageIds.includes(String(item.related_id))));
  };

  const loadNotifications = async () => {
    if (!session?.user) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("is_read", false)
      .order("created_at", { ascending: false });

    if (!error) {
      const cleaned = await clearReadMessageNotifications(data || []);
      setNotifications(cleaned);
    }
  };

  const loadUnreadMessageCount = async () => {
    if (!session?.user) return;
    const { data, error } = await supabase
      .from("conversations")
      .select("id, messages(id, sender_id, is_read)")
      .or(`user1_id.eq.${session.user.id},user2_id.eq.${session.user.id}`);

    if (error) return;

    const count = (data || []).reduce((total, conversation) => {
      return total + (conversation.messages || []).filter(message => message.sender_id !== session.user.id && !message.is_read).length;
    }, 0);

    setUnreadMessageCount(count);
  };

  const loadPendingRequestCount = async () => {
    if (!session?.user) return;
    const { count, error } = await supabase
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", session.user.id)
      .eq("status", "pending");

    if (!error) setPendingRequestCount(count || 0);
  };

  const signOut = async () => {
    setBiometricLocked(false);
    await supabase.auth.signOut();
  };

  const unlockWithBiometric = async () => {
    if (!session?.user) return;
    setBiometricChecking(true);
    try {
      const unlocked = await authenticateBiometric(session.user);
      if (unlocked) setBiometricLocked(false);
    } catch (error) {
      toast.error(error.message || "Could not unlock with this device");
    } finally {
      setBiometricChecking(false);
    }
  };

  const startReadingSession = (reading) => {
    if (!session?.user) {
      toast.error("Please sign in first");
      return false;
    }
    if (!reading.title?.trim()) {
      toast.error("Add an article title first");
      return false;
    }
    setActiveReading({
      ...reading,
      title: reading.title.trim(),
      url: reading.url?.trim() || "",
      notes: reading.notes?.trim() || "",
      reflection: reading.reflection?.trim() || "",
      started_at: new Date().toISOString()
    });
    toast.success("Reading timer started");
    return true;
  };

  const finishReadingSession = async (extra = {}) => {
    if (!activeReading || !session?.user || savingReading) return false;
    setSavingReading(true);
    const finishedAt = new Date();
    const startedAt = new Date(activeReading.started_at);
    const duration = Math.max(1, Math.round((finishedAt - startedAt) / (1000 * 60)));
    const finalReading = {
      ...activeReading,
      title: extra.title?.trim() || activeReading.title,
      url: extra.url?.trim() || activeReading.url || "",
      category: extra.category || activeReading.category || "Medicine",
      notes: extra.notes?.trim() || activeReading.notes || "",
      reflection: extra.reflection?.trim() || activeReading.reflection || ""
    };
    
    const { error } = await supabase.from("cpd_reading").insert({
      user_id: session.user.id,
      title: finalReading.title,
      article_url: finalReading.url || null,
      category: finalReading.category,
      notes: finalReading.notes || null,
      reflection: finalReading.reflection,
      user_reflection: finalReading.reflection,
      ai_reflection: finalReading.reflection,
      started_at: activeReading.started_at,
      finished_at: finishedAt.toISOString(),
      duration_minutes: duration
    });

    if (error) {
      toast.error(error.message);
      setSavingReading(false);
      return false;
    }

    setActiveReading(null);
    setSavingReading(false);
    window.dispatchEvent(new Event("cpdUpdated"));
    toast.success("Reading saved");
    return true;
  };

  const cancelReadingSession = () => {
    setActiveReading(null);
    toast.success("Reading timer cancelled");
  };

  const shellClass = darkMode
    ? "min-h-screen bg-gradient-to-b from-[#071A24] to-[#0D2D35] text-slate-100"
    : "min-h-screen bg-gradient-to-b from-[#F9FCFB] to-[#EAF5F3] text-[#113247]";

  if (loading) return <div className={shellClass + " grid place-items-center font-bold"}>Loading VetLearn...</div>;
  if (!session) return <><Toaster position="top-center" /><AuthPage /></>;

  const displayName = profile?.full_name || session.user.user_metadata?.full_name || session.user.email;
  const menuBadgeCount = unreadMessageCount + pendingRequestCount;

  const menuLinks = [
    { to: "/protocols", label: "Clinical Protocols", icon: ClipboardList },
    { to: "/network", label: "Network", icon: Users, badge: pendingRequestCount },
    { to: "/messages", label: "Messages", icon: MessageSquare, badge: unreadMessageCount },
    { to: "/notifications", label: "Notifications", icon: Bell, badge: unreadNotificationCount },
    { to: "/vault", label: "Vault", icon: KeyRound },
    { to: "/settings", label: "Settings", icon: SettingsIcon }
  ];

  return (
    <BrowserRouter>
      <ScrollToTop />
      <RecentRouteTracker user={session.user} />
      <Toaster position="top-center" />
      <div className={shellClass}>
        <AppHeader
          darkMode={darkMode}
          displayName={displayName}
          unreadNotificationCount={unreadNotificationCount}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          onSignOut={signOut}
        />

        <NotificationDrawer isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} notifications={notifications} setNotifications={setNotifications} darkMode={darkMode} />

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
            <div className={`fixed inset-y-0 right-0 z-[60] w-72 shadow-2xl p-6 flex flex-col gap-4 transform transition-transform duration-300 overflow-y-auto ${darkMode ? "bg-[#071A24] border-l border-white/10" : "bg-white border-l border-slate-200"}`}>
              <div className="flex justify-between items-center mb-4 border-b pb-4 border-slate-200 dark:border-white/10">
                <h2 className={`text-2xl font-black ${darkMode ? "text-white" : "text-[#113247]"}`}>Menu</h2>
                <button onClick={() => setMenuOpen(false)} className={`p-2 rounded-full transition ${darkMode ? "text-slate-300 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}><X size={24} /></button>
              </div>
              <div className="flex flex-col gap-2">
                {menuLinks.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={`flex items-center justify-between gap-3 p-3 rounded-lg font-bold transition ${darkMode ? "hover:bg-white/10 text-slate-200" : "hover:bg-[#E8F8F5] text-[#0B3760]"}`}>
                      <span className="flex items-center gap-3"><Icon size={20} /> {item.label}</span>
                      {item.badge > 0 && <span className="bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">{item.badge}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="max-w-md mx-auto min-h-screen px-4 pt-5 pb-28">
          <Routes>
            <Route path="/" element={<HomeDashboard user={session.user} profile={profile} darkMode={darkMode} unreadMessageCount={unreadMessageCount} unreadNotificationCount={unreadNotificationCount} />} />
            <Route path="/cpd" element={<CPD user={session.user} profile={profile} darkMode={darkMode} activeReading={activeReading} onStartReading={startReadingSession} onFinishReading={finishReadingSession} savingReading={savingReading} />} />
            <Route path="/caselogs" element={<Caselogs user={session.user} darkMode={darkMode} />} />
            <Route path="/drugs" element={<Drugs user={session.user} darkMode={darkMode} />} />
            <Route path="/network" element={<Network user={session.user} darkMode={darkMode} />} />
            <Route path="/settings" element={<SettingsPage user={session.user} darkMode={darkMode} setDarkMode={setDarkMode} />} />
            <Route path="/messages" element={<Messages user={session.user} darkMode={darkMode} />} />
            <Route path="/notifications" element={<NotificationsPage user={session.user} darkMode={darkMode} />} />
            <Route path="/protocols" element={<Protocols user={session.user} darkMode={darkMode} />} />
            <Route path="/vault" element={<Vault user={session.user} darkMode={darkMode} />} />
          </Routes>
        </div>

        {biometricLocked && <BiometricGate darkMode={darkMode} checking={biometricChecking} onUnlock={unlockWithBiometric} onSignOut={signOut} />}
        <FloatingReadingTimer session={activeReading} onFinish={() => finishReadingSession()} onCancel={cancelReadingSession} darkMode={darkMode} />
        <Navbar darkMode={darkMode} onOpenMenu={() => setMenuOpen(true)} menuBadgeCount={menuBadgeCount} />
      </div>
    </BrowserRouter>
  );
}

export default App;
