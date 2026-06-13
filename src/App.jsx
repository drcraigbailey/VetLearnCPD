import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Bell, Calculator, ClipboardList, KeyRound, Lock, LogOut, MessageSquare, Moon, Settings as SettingsIcon, ShieldCheck, Sun, Users, X } from "lucide-react";
import toast from "react-hot-toast";

import { HybridToaster } from "./components/CustomToast";
import FeatureUnavailable from "./components/FeatureUnavailable";
import FloatingReadingTimer from "./components/FloatingReadingTimer";
import LoadingState from "./components/LoadingState";
import Navbar from "./components/Navbar";
import NotificationDrawer from "./components/NotificationDrawer";
import { supabase } from "./supabaseClient";
import { authenticateBiometric, disableBiometric, isBiometricAvailable, isBiometricEnabled, syncBiometricSession } from "./utils/biometricAuth";
import { canUseFeature, defaultFeatureAccess, featureKeys, loadFeatureAccess } from "./utils/featureAccess";
import { setupPushNotifications } from "./utils/pushNotifications";

import AdminDashboard from "./pages/AdminDashboard";
import AuthPage from "./pages/AuthPage";
import CPD from "./pages/CPD";
import Caselogs from "./pages/Caselogs";
import ClinicalToolsPage from "./pages/ClinicalToolsPage";
import HomeDashboard from "./pages/HomeDashboard";
import Formulary from "./pages/Formulary.jsx";
import SettingsPage from "./pages/Settings";
import Network from "./pages/Network";
import Messages from "./pages/Messages";
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
  "/clinical-tools": { title: "Clinical Tools", item_type: "page" },
  "/network": { title: "Professional Network", item_type: "page" },
  "/messages": { title: "Messages", item_type: "page" },
  "/protocols": { title: "Clinical Protocols", item_type: "protocol" },
  "/vault": { title: "Vault", item_type: "page" },
  "/settings": { title: "Settings", item_type: "page" },
  "/admin": { title: "Admin Dashboard", item_type: "page" }
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

function BiometricGate({ darkMode, checking, onUnlock, onPasswordFallback }) {
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
        <button onClick={onPasswordFallback} disabled={checking} className="mt-4 w-full rounded-lg bg-[#E8F8F5] text-[#0B3760] p-3 text-sm font-black disabled:opacity-60">
          Use email and password instead
        </button>
        <p className="mt-3 text-xs opacity-55 leading-5">This turns fingerprint login off on this device so you can get back in normally.</p>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [adminAccess, setAdminAccess] = useState(false);
  const [featureAccess, setFeatureAccess] = useState(defaultFeatureAccess);
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
      if (data.session?.user) syncBiometricSession(data.session.user, data.session);
      setSession(data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession?.user && (_event === "SIGNED_IN" || _event === "TOKEN_REFRESHED")) {
        syncBiometricSession(nextSession.user, nextSession);
      }
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    setupPushNotifications(session.user).then((result) => {
      if (result?.error) console.warn("Push notification setup skipped:", result.error);
    });
  }, [session?.user?.id]);

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
        setAdminAccess(false);
        setFeatureAccess(defaultFeatureAccess);
        setNotifications([]);
        setUnreadNotificationCount(0);
        setUnreadMessageCount(0);
        setPendingRequestCount(0);
        return;
      }

      const [profileRes, adminRes, nextFeatureAccess] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
        supabase.from("admin_user_roles").select("role, is_active").eq("user_id", session.user.id).eq("is_active", true).maybeSingle(),
        loadFeatureAccess()
      ]);
      setProfile(profileRes.data || null);
      setAdminAccess(["admin", "super_admin"].includes(adminRes.data?.role));
      setFeatureAccess(nextFeatureAccess);
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
    const refreshFeatureAccess = async () => setFeatureAccess(await loadFeatureAccess());

    window.addEventListener("notificationsUpdated", refreshNotifications);
    window.addEventListener("messagesUpdated", refreshMessages);
    window.addEventListener("networkUpdated", refreshRequests);
    window.addEventListener("profileUpdated", refreshProfile);
    window.addEventListener("featureAccessUpdated", refreshFeatureAccess);

    return () => {
      window.removeEventListener("notificationsUpdated", refreshNotifications);
      window.removeEventListener("messagesUpdated", refreshMessages);
      window.removeEventListener("networkUpdated", refreshRequests);
      window.removeEventListener("profileUpdated", refreshProfile);
      window.removeEventListener("featureAccessUpdated", refreshFeatureAccess);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_feature_access" }, async () => setFeatureAccess(await loadFeatureAccess()))
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
    if (session?.user?.id && isBiometricEnabled(session.user.id)) {
      await supabase.auth.signOut({ scope: "local" });
      window.dispatchEvent(new Event("biometricSettingsUpdated"));
      return;
    }
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

  const usePasswordFallback = async () => {
    if (!session?.user) return;
    setBiometricChecking(true);
    try {
      await disableBiometric(session.user.id);
      setBiometricLocked(false);
      await supabase.auth.signOut({ scope: "local" });
      window.dispatchEvent(new Event("biometricSettingsUpdated"));
      toast.success("Fingerprint login turned off. Sign in with email and password.");
    } catch (error) {
      toast.error(error.message || "Could not switch to email login");
    } finally {
      setBiometricChecking(false);
    }
  };

  const insertCpdReading = async (payload) => {
    const result = await supabase.from("cpd_reading").insert(payload);
    if (!result.error) return result;

    const message = result.error.message || "";
    const canFallback = message.includes("entry_source") || message.includes("manual_minutes") || message.includes("column");
    if (!canFallback) return result;

    const { entry_source, manual_minutes, ...legacyPayload } = payload;
    return supabase.from("cpd_reading").insert(legacyPayload);
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

    const { error } = await insertCpdReading({
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
      duration_minutes: duration,
      entry_source: "timer",
      manual_minutes: null
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

  const saveManualReadingSession = async (reading = {}) => {
    if (!session?.user || savingReading) return false;
    if (!reading.title?.trim()) {
      toast.error("Add an article title first");
      return false;
    }

    const minutes = Number(reading.duration_minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      toast.error("Enter reading time in minutes");
      return false;
    }
    if (minutes > 720) {
      toast.error("Please split readings longer than 12 hours into separate CPD entries");
      return false;
    }

    setSavingReading(true);
    const finishedAt = new Date();
    const startedAt = new Date(finishedAt.getTime() - Math.round(minutes) * 60 * 1000);
    const reflection = reading.reflection?.trim() || "";

    const { error } = await insertCpdReading({
      user_id: session.user.id,
      title: reading.title.trim(),
      article_url: reading.url?.trim() || null,
      category: reading.category || "Medicine",
      notes: reading.notes?.trim() || null,
      reflection,
      user_reflection: reflection,
      ai_reflection: reflection,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_minutes: Math.round(minutes),
      entry_source: "manual",
      manual_minutes: Math.round(minutes)
    });

    if (error) {
      toast.error(error.message);
      setSavingReading(false);
      return false;
    }

    setSavingReading(false);
    window.dispatchEvent(new Event("cpdUpdated"));
    toast.success("Manual reading saved");
    return true;
  };

  const cancelReadingSession = () => {
    setActiveReading(null);
    toast.success("Reading timer cancelled");
  };

  const shellClass = darkMode
    ? "min-h-screen bg-gradient-to-b from-[#071A24] to-[#0D2D35] text-slate-100"
    : "min-h-screen bg-gradient-to-b from-[#F9FCFB] to-[#EAF5F3] text-[#113247]";

  if (loading) return <LoadingState label="Loading VetLearn..." darkMode={darkMode} fullScreen />;
  if (!session) return <><HybridToaster darkMode={darkMode} /><AuthPage /></>;

  const displayName = profile?.full_name || session.user.user_metadata?.full_name || session.user.email;
  const menuBadgeCount = (canUseFeature(featureAccess, featureKeys.messaging, adminAccess) ? unreadMessageCount : 0)
    + (canUseFeature(featureAccess, featureKeys.network, adminAccess) ? pendingRequestCount : 0);
  const featureEnabled = (featureKey) => canUseFeature(featureAccess, featureKey, adminAccess);
  const featureRoute = (featureKey, title, element) => featureEnabled(featureKey) ? element : <FeatureUnavailable darkMode={darkMode} title={title} />;

  const menuLinks = [
    ...(adminAccess ? [{ to: "/admin", label: "Admin", icon: ShieldCheck }] : []),
    ...(featureEnabled(featureKeys.clinicalProtocols) ? [{ to: "/protocols", label: "Clinical Protocols", icon: ClipboardList }] : []),
    ...(featureEnabled(featureKeys.clinicalTools) ? [{ to: "/clinical-tools", label: "Clinical Tools", icon: Calculator }] : []),
    ...(featureEnabled(featureKeys.network) ? [{ to: "/network", label: "Network", icon: Users, badge: pendingRequestCount }] : []),
    ...(featureEnabled(featureKeys.messaging) ? [{ to: "/messages", label: "Messages", icon: MessageSquare, badge: unreadMessageCount }] : []),
    ...(featureEnabled(featureKeys.vault) ? [{ to: "/vault", label: "Vault", icon: KeyRound }] : []),
    { to: "/settings", label: "Settings", icon: SettingsIcon }
  ];

  return (
    <BrowserRouter>
      <ScrollToTop />
      <RecentRouteTracker user={session.user} />
      <HybridToaster darkMode={darkMode} />
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
            <Route path="/" element={<HomeDashboard user={session.user} profile={profile} darkMode={darkMode} unreadMessageCount={unreadMessageCount} unreadNotificationCount={unreadNotificationCount} featureAccess={featureAccess} adminAccess={adminAccess} />} />
            <Route path="/cpd" element={featureRoute(featureKeys.cpdTracker, "CPD", <CPD user={session.user} profile={profile} darkMode={darkMode} activeReading={activeReading} onStartReading={startReadingSession} onFinishReading={finishReadingSession} onSaveManualReading={saveManualReadingSession} savingReading={savingReading} />)} />
            <Route path="/caselogs" element={featureRoute(featureKeys.caseLogs, "Case Logs", <Caselogs user={session.user} darkMode={darkMode} />)} />
            <Route path="/drugs" element={featureRoute(featureKeys.drugDatabase, "Formulary", <Formulary user={session.user} darkMode={darkMode} featureAccess={featureAccess} adminAccess={adminAccess} />)} />
            <Route path="/drugs/my-drugs" element={featureRoute(featureKeys.drugDatabase, "Formulary", featureRoute(featureKeys.myDrugs, "My Drugs", <Formulary user={session.user} darkMode={darkMode} featureAccess={featureAccess} adminAccess={adminAccess} />))} />
            <Route path="/drugs/my-monographs" element={featureRoute(featureKeys.drugDatabase, "Formulary", featureRoute(featureKeys.myDrugs, "My Drugs", <Formulary user={session.user} darkMode={darkMode} featureAccess={featureAccess} adminAccess={adminAccess} />))} />
            <Route path="/clinical-tools" element={featureRoute(featureKeys.clinicalTools, "Clinical Tools", <ClinicalToolsPage user={session.user} darkMode={darkMode} featureAccess={featureAccess} adminAccess={adminAccess} />)} />
            <Route path="/network" element={featureRoute(featureKeys.network, "Network", <Network user={session.user} darkMode={darkMode} />)} />
            <Route path="/settings" element={<SettingsPage user={session.user} darkMode={darkMode} setDarkMode={setDarkMode} />} />
            <Route path="/messages" element={featureRoute(featureKeys.messaging, "Messages", <Messages user={session.user} darkMode={darkMode} />)} />
            <Route path="/protocols" element={featureRoute(featureKeys.clinicalProtocols, "Clinical Protocols", <Protocols user={session.user} darkMode={darkMode} />)} />
            <Route path="/vault" element={featureRoute(featureKeys.vault, "Vault", <Vault user={session.user} darkMode={darkMode} />)} />
            <Route path="/admin" element={<AdminDashboard user={session.user} profile={profile} darkMode={darkMode} />} />
          </Routes>
        </div>

        {biometricLocked && <BiometricGate darkMode={darkMode} checking={biometricChecking} onUnlock={unlockWithBiometric} onPasswordFallback={usePasswordFallback} />}
        <FloatingReadingTimer session={activeReading} onFinish={() => finishReadingSession()} onCancel={cancelReadingSession} darkMode={darkMode} />
        <Navbar darkMode={darkMode} onOpenMenu={() => setMenuOpen(true)} menuBadgeCount={menuBadgeCount} featureAccess={featureAccess} adminAccess={adminAccess} />
      </div>
    </BrowserRouter>
  );
}

export default App;
