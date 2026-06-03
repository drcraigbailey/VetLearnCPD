import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, FileText, BriefcaseMedical, Syringe, Menu } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../supabaseClient";
import { logSiteActivity } from "../utils/activityTracking";
import { canUseFeature, featureKeys } from "../utils/featureAccess";

const routeAnalytics = {
  "/": { title: "Dashboard", section: "Dashboard" },
  "/cpd": { title: "CPD Portfolio", section: "CPD Tracker" },
  "/caselogs": { title: "Case Logs", section: "Case Logs" },
  "/drugs": { title: "Formulary", section: "Formulary" },
  "/clinical-tools": { title: "Clinical Tools", section: "Clinical Tools" },
  "/network": { title: "Professional Network", section: "Network" },
  "/messages": { title: "Messages", section: "Messages" },
  "/protocols": { title: "Clinical Protocols", section: "Clinical Protocols" },
  "/vault": { title: "Vault", section: "Vault" },
  "/settings": { title: "Settings", section: "Settings" },
  "/admin": { title: "Admin Dashboard", section: "Admin" }
};

export default function Navbar({ darkMode, onOpenMenu, menuBadgeCount = 0, featureAccess, adminAccess = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const lastBackPressRef = useRef(0);
  const [currentUserId, setCurrentUserId] = useState("");
  const isActive = (path) => location.pathname === path ? "text-[#71CFC2] opacity-100" : "opacity-50 hover:opacity-100 transition-opacity";

  const labelClass = "text-[10px] font-bold leading-none tracking-normal";
  const navItems = [
    { to: "/", label: "Home", icon: LayoutDashboard, enabled: true },
    { to: "/cpd", label: "CPD", icon: FileText, enabled: canUseFeature(featureAccess, featureKeys.cpdTracker, adminAccess) },
    { to: "/caselogs", label: "Cases", icon: BriefcaseMedical, enabled: canUseFeature(featureAccess, featureKeys.caseLogs, adminAccess) },
    { to: "/drugs", label: "Formulary", icon: Syringe, enabled: canUseFeature(featureAccess, featureKeys.drugDatabase, adminAccess) }
  ].filter(item => item.enabled);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentUserId(data.user?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const route = routeAnalytics[location.pathname];
    if (!currentUserId || !route) return undefined;

    const startedAt = new Date();
    return () => {
      const endedAt = new Date();
      const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
      if (durationSeconds < 2) return;
      logSiteActivity({
        userId: currentUserId,
        path: location.pathname,
        title: route.title,
        section: route.section,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds
      });
    };
  }, [currentUserId, location.pathname]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let listener;
    let cancelled = false;

    const attachListener = async () => {
      listener = await CapacitorApp.addListener("backButton", () => {
        if (location.pathname !== "/") {
          if (window.history.length > 1) navigate(-1);
          else navigate("/", { replace: true });
          return;
        }

        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          CapacitorApp.exitApp();
          return;
        }

        lastBackPressRef.current = now;
        toast("Press back again to exit.");
      });

      if (cancelled) listener?.remove?.();
    };

    attachListener();

    return () => {
      cancelled = true;
      listener?.remove?.();
    };
  }, [location.pathname, navigate]);

  return (
    <div className={`fixed bottom-0 w-full border-t p-4 pb-safe z-30 ${darkMode ? "bg-[#0B242B] border-white/10 text-white" : "bg-white border-[#DCEDEA] text-[#113247]"}`}>
      <div className="max-w-md mx-auto flex justify-between items-center px-2">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className={`flex flex-col items-center gap-1 ${isActive(item.to)}`} aria-label={item.label}>
              <Icon size={24} />
              <span className={labelClass}>{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onOpenMenu}
          className="relative flex flex-col items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Open menu"
        >
          <Menu size={24} />
          <span className={labelClass}>More</span>
          {menuBadgeCount > 0 && (
            <span className="absolute -top-2 -right-3 bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 font-bold">
              {menuBadgeCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
