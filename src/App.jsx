import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Link } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { ArrowLeft, Bell, Calculator, ClipboardList, KeyRound, Lock, LogOut, MessageSquare, Moon, Settings as SettingsIcon, ShieldCheck, Sun, Users, X } from "lucide-react";
import toast from "react-hot-toast";

import AndroidClipboardToolbar from "./components/AndroidClipboardToolbar";
import { HybridToaster } from "./components/CustomToast";
import FeatureUnavailable from "./components/FeatureUnavailable";
import FloatingReadingTimer from "./components/FloatingReadingTimer";
import LoadingState from "./components/LoadingState";
import Navbar from "./components/Navbar";
import NotificationDrawer from "./components/NotificationDrawer";
import PdfViewerModal from "./components/PdfViewerModal";
import { IconButton } from "./components/VetLearnUI";
import { supabase } from "./supabaseClient";
import { authenticateBiometric, disableBiometric, isBiometricAvailable, isBiometricEnabled, registerBiometric, syncBiometricSession } from "./utils/biometricAuth";
import { canUseFeature, featureKeys, getCachedFeatureAccess, loadFeatureAccess } from "./utils/featureAccess";
import { subscribePdfViewer } from "./utils/pdfViewerBridge";
import { setupPushNotifications } from "./utils/pushNotifications";
import { configureStatusBar } from "./lib/statusBar";

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

function scrollBackToTop() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  } catch {
    window.scrollTo(0, 0);
  }
}

function GlobalScrollTopButton({ darkMode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;

    const updateVisibility = () => {
      ticking = false;
      setVisible(window.scrollY > 350);
    };

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateVisibility);
    };

    updateVisibility();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollBackToTop}
      aria-label="Scroll back to top"
      className={`fixed right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 rounded-full px-4 py-2.5 text-sm font-black shadow-[0_12px_28px_rgba(11,55,96,0.18)] transition active:scale-95 ${
        darkMode
          ? "border border-white/10 bg-[#071A24]/95 text-[#71CFC2] backdrop-blur-xl"
          : "border border-[#DCEDEA] bg-white/95 text-[#0B3760] backdrop-blur-xl"
      }`}
    >
      ↑ Top
    </button>
  );
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

const adminNotificationTypes = ["admin_new_signup", "admin_support_message", "admin_group_message"];

const getDisplayName = (profile, user, adminAccess = false) => {
  const profileName = String(profile?.full_name || "").trim();
  const metadataName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || "").trim();
  const email = user?.email || "";
  const adminLikeProfileName = ["admin", "vetlearn support"].includes(profileName.toLowerCase());

  if (adminAccess && adminLikeProfileName && metadataName) return metadataName;
  return profileName || metadataName || email;
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

function NativeLaunchHomeRedirect() {
  // Keep native resumes on the user's current screen.
  return null;
}

function NativeBackButtonHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform?.()) return undefined;

    let backButtonListener = null;
    CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      const currentLocation = locationRef.current;
      const isHome = currentLocation.pathname === "/" && !currentLocation.search;

      if (!isHome) {
        if (canGoBack || window.history.length > 1) navigate(-1);
        else navigate("/", { replace: true });
        return;
      }

      CapacitorApp.exitApp();
    }).then((listener) => {
      backButtonListener = listener;
    });

    return () => {
      backButtonListener?.remove();
    };
  }, [navigate]);

  return null;
}

function AppHeader({ darkMode, displayName, unreadNotificationCount, onOpenNotifications, onToggleDarkMode, onSignOut, onLockApp, onScrollTop }) {
  const location = useLocation();
  const navigate = useNavigate();
  const showBack = location.pathname !== "/";
  const [securityMenuOpen, setSecurityMenuOpen] = useState(false);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const closeSecurityMenu = () => setSecurityMenuOpen(false);

  return (
    <div className={`sticky top-0 z-40 border-b backdrop-blur-xl ${darkMode ? "border-white/10 bg-[#071A24]/85" : "border-[#DCEDEA] bg-white/85"}`}>
      <div className="max-w-md mx-auto px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {showBack && (
              <IconButton icon={ArrowLeft} label="Go back" darkMode={darkMode} onClick={goBack} />
            )}
            <button type="button" onClick={onScrollTop} className="flex min-w-0 items-center gap-2 text-left" aria-label="Scroll back to top">
              <img src="/logo.png" alt="VetLearn CPD" className="w-12 h-12 object-contain shrink-0" />
              <span className="min-w-0">
                <span className={`block text-xl font-black tracking-normal ${darkMode ? "text-white" : "text-[#113247]"}`}>VetLearn</span>
                <span className="block text-sm text-[#0F8F83] font-semibold truncate">{displayName}</span>
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <IconButton icon={Bell} label="Open notifications" badge={unreadNotificationCount || null} darkMode={darkMode} onClick={onOpenNotifications} />
            <IconButton icon={darkMode ? Sun : Moon} label="Toggle dark mode" darkMode={darkMode} onClick={onToggleDarkMode} />
            <div className="relative">
              <IconButton icon={LogOut} label="Open logout and lock options" darkMode={darkMode} onClick={() => setSecurityMenuOpen(open => !open)} />

              {securityMenuOpen && (
                <>
                  <button className="fixed inset-0 z-40 cursor-default" aria-label="Close security menu" onClick={closeSecurityMenu} type="button" />
                  <div className={`absolute right-0 top-12 z-50 w-56 rounded-2xl border p-2 shadow-2xl ${darkMode ? "border-white/10 bg-[#071A24] text-slate-100" : "border-[#DCEDEA] bg-white text-[#113247]"}`}>
                    <button
                      onClick={() => {
                        closeSecurityMenu();
                        onLockApp();
                      }}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left font-black transition ${darkMode ? "hover:bg-white/10" : "hover:bg-[#E8F8F5]"}`}
                      type="button"
                    >
                      <Lock size={18} />
                      <span>
                        <span className="block">Lock app</span>
                        <span className="block text-xs font-semibold opacity-60">Fingerprint or password to unlock</span>
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        closeSecurityMenu();
                        onSignOut();
                      }}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left font-black transition ${darkMode ? "hover:bg-white/10" : "hover:bg-[#E8F8F5]"}`}
                      type="button"
                    >
                      <LogOut size={18} />
                      <span>
                        <span className="block">Log out</span>
                        <span className="block text-xs font-semibold opacity-60">Fully leave this account</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
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

function LockSetupPrompt({ darkMode, biometricAvailable, checking, onEnableBiometric, onPasswordLock, onClose }) {
  const canEnableBiometric = biometricAvailable === true;
  const availabilityText = biometricAvailable === null
    ? "Checking this device..."
    : canEnableBiometric
      ? "Fingerprint unlock is available on this device."
      : "Fingerprint unlock is not available on this device.";

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-black/55 px-5 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className={`w-full max-w-sm rounded-3xl border p-6 text-center shadow-2xl ${darkMode ? "border-white/10 bg-[#071A24] text-white" : "border-[#DCEDEA] bg-white text-[#113247]"}`}>
        <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-[#E8F8F5] text-[#0B3760] grid place-items-center">
          <ShieldCheck size={28} />
        </div>
        <h2 className="text-2xl font-black mb-2">Lock VetLearn</h2>
        <p className="text-sm opacity-70 leading-6 mb-4">
          Fingerprint unlock is not switched on for this device. Turn it on now, or lock the app and use your password next time.
        </p>
        <div className={`mb-5 rounded-2xl px-3 py-2 text-xs font-black ${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
          {availabilityText}
        </div>
        <button
          onClick={onEnableBiometric}
          disabled={!canEnableBiometric || checking}
          className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-4 font-black disabled:cursor-not-allowed disabled:opacity-55"
          type="button"
        >
          {checking ? "Working..." : "Turn on fingerprint and lock"}
        </button>
        <button
          onClick={onPasswordLock}
          disabled={checking}
          className={`mt-4 w-full rounded-lg p-3 text-sm font-black disabled:opacity-60 ${darkMode ? "bg-white/10 text-slate-100" : "bg-[#E8F8F5] text-[#0B3760]"}`}
          type="button"
        >
          Continue with password
        </button>
        <button
          onClick={onClose}
          disabled={checking}
          className={`mt-3 w-full rounded-lg p-2 text-sm font-bold disabled:opacity-60 ${darkMode ? "text-slate-300" : "text-slate-500"}`}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [adminAccess, setAdminAccess] = useState(false);
  const [featureAccess, setFeatureAccess] = useState(getCachedFeatureAccess);
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
  const [lockSetupOpen, setLockSetupOpen] = useState(false);
  const [lockSetupChecking, setLockSetupChecking] = useState(false);
  const [lockSetupBiometricAvailable, setLockSetupBiometricAvailable] = useState(null);
  const [activeReading, setActiveReading] = useState(() => {
    const saved = localStorage.getItem("vetlearn-active-reading");
    return saved ? JSON.parse(saved) : null;
  });
  const [pdfViewer, setPdfViewer] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("vetlearn-theme") === "dark");

  useEffect(() => {
    localStorage.setItem("vetlearn-theme", darkMode ? "dark" : "light");
    configureStatusBar(darkMode);
  }, [darkMode]);

  useEffect(() => subscribePdfViewer((payload) => {
    if (payload?.source) setPdfViewer(payload);
  }), []);

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
        setFeatureAccess(getCachedFeatureAccess());
        setNotifications([]);
        setUnreadNotificationCount(0);
        setUnreadMessageCount(0);
        setPendingRequestCount(0);
        setLockSetupOpen(false);
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
    const [directResult, participantResult] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, messages(id, sender_id, is_read)")
        .or(`user1_id.eq.${session.user.id},user2_id.eq.${session.user.id}`),
      supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", session.user.id)
    ]);

    if (directResult.error && participantResult.error) return;

    const participantConversationIds = [...new Set((participantResult.data || []).map(row => row.conversation_id).filter(Boolean))];
    let participantConversations = [];
    if (!participantResult.error && participantConversationIds.length) {
      const { data } = await supabase
        .from("conversations")
        .select("id, messages(id, sender_id, is_read)")
        .in("id", participantConversationIds);
      participantConversations = data || [];
    }

    const merged = new Map();
    [...(directResult.data || []), ...participantConversations].forEach(conversation => {
      if (conversation?.id) merged.set(String(conversation.id), conversation);
    });

    const count = [...merged.values()].reduce((total, conversation) => {
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
    setLockSetupOpen(false);
    if (session?.user?.id && isBiometricEnabled(session.user.id)) {
      await supabase.auth.signOut({ scope: "local" });
      window.dispatchEvent(new Event("biometricSettingsUpdated"));
      return;
    }
    await supabase.auth.signOut();
  };

  const lockApp = async () => {
    if (!session?.user) return;

    const available = await isBiometricAvailable();
    const biometricEnabled = isBiometricEnabled(session.user.id);

    if (available && biometricEnabled) {
      setBiometricLocked(true);
      toast.success("VetLearn locked");
      return;
    }

    setLockSetupBiometricAvailable(available);
    setLockSetupOpen(true);
  };

  const enableBiometricAndLock = async () => {
    if (!session?.user) return;
    setLockSetupChecking(true);
    try {
      const { data } = await supabase.auth.getSession();
      const currentSession = data.session || session;
      await registerBiometric(currentSession.user, currentSession);
      setLockSetupOpen(false);
      setBiometricLocked(true);
      toast.success("Fingerprint unlock enabled. VetLearn locked.");
    } catch (error) {
      toast.error(error.message || "Could not turn on fingerprint unlock");
    } finally {
      setLockSetupChecking(false);
    }
  };

  const lockWithPassword = async () => {
    setLockSetupChecking(true);
    try {
      setLockSetupOpen(false);
      setBiometricLocked(false);
      await supabase.auth.signOut({ scope: "local" });
      toast.success("App locked. Sign in with your password to unlock.");
    } catch (error) {
      toast.error(error.message || "Could not lock the app");
    } finally {
      setLockSetupChecking(false);
    }
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
    ? "dark min-h-screen bg-gradient-to-b from-[#071A24] to-[#0D2D35] text-slate-100"
    : "min-h-screen bg-gradient-to-b from-[#F9FCFB] to-[#EAF5F3] text-[#113247]";

  if (loading) return <LoadingState label="Loading VetLearn..." darkMode={darkMode} fullScreen />;
  if (!session) return <><HybridToaster darkMode={darkMode} /><AndroidClipboardToolbar darkMode={darkMode} /><AuthPage /></>;

  const displayName = getDisplayName(profile, session.user, adminAccess);
  const adminNotificationCount = adminAccess
    ? notifications.filter(notification => !notification.is_read && adminNotificationTypes.includes(notification.type)).length
    : 0;
  const menuBadgeCount = (canUseFeature(featureAccess, featureKeys.messaging, adminAccess) ? unreadMessageCount : 0)
    + (canUseFeature(featureAccess, featureKeys.network, adminAccess) ? pendingRequestCount : 0)
    + adminNotificationCount;
  const featureEnabled = (featureKey) => canUseFeature(featureAccess, featureKey, adminAccess);
  const featureRoute = (featureKey, title, element) => featureEnabled(featureKey) ? element : <FeatureUnavailable darkMode={darkMode} title={title} />;

  const menuLinks = [
    ...(adminAccess ? [{ to: "/admin", label: "Admin", icon: ShieldCheck, badge: adminNotificationCount }] : []),
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
      <NativeLaunchHomeRedirect />
      <NativeBackButtonHandler />
      <RecentRouteTracker user={session.user} />
      <HybridToaster darkMode={darkMode} />
      <AndroidClipboardToolbar darkMode={darkMode} />
      <div className={`${shellClass} vetlearn-app-shell`}>
        <AppHeader
          darkMode={darkMode}
          displayName={displayName}
          unreadNotificationCount={unreadNotificationCount}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          onSignOut={signOut}
          onLockApp={lockApp}
          onScrollTop={scrollBackToTop}
        />

        <NotificationDrawer isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} notifications={notifications} setNotifications={setNotifications} darkMode={darkMode} />

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
            <div className={`fixed inset-y-0 right-0 z-[60] w-72 shadow-2xl p-6 flex flex-col gap-4 transform transition-transform duration-300 overflow-y-auto ${darkMode ? "bg-[#071A24] border-l border-white/10" : "bg-white border-l border-slate-200"}`}>
              <div className="flex justify-between items-center mb-4 border-b pb-4 border-slate-200 dark:border-white/10">
                <h2 className={`text-2xl font-black ${darkMode ? "text-white" : "text-[#113247]"}`}>Menu</h2>
                <IconButton icon={X} label="Close menu" darkMode={darkMode} onClick={() => setMenuOpen(false)} />
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

        {lockSetupOpen && (
          <LockSetupPrompt
            darkMode={darkMode}
            biometricAvailable={lockSetupBiometricAvailable}
            checking={lockSetupChecking}
            onEnableBiometric={enableBiometricAndLock}
            onPasswordLock={lockWithPassword}
            onClose={() => setLockSetupOpen(false)}
          />
        )}
        {biometricLocked && <BiometricGate darkMode={darkMode} checking={biometricChecking} onUnlock={unlockWithBiometric} onPasswordFallback={usePasswordFallback} />}
        <PdfViewerModal viewer={pdfViewer} darkMode={darkMode} onClose={() => setPdfViewer(null)} />
        <FloatingReadingTimer session={activeReading} onFinish={() => finishReadingSession()} onCancel={cancelReadingSession} darkMode={darkMode} />
        <GlobalScrollTopButton darkMode={darkMode} />
        <Navbar darkMode={darkMode} onOpenMenu={() => setMenuOpen(true)} menuBadgeCount={menuBadgeCount} featureAccess={featureAccess} adminAccess={adminAccess} />
      </div>
    </BrowserRouter>
  );
}

export default App;
