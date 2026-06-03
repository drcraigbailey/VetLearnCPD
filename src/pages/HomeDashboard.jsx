import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BriefcaseMedical, Calculator, ChevronDown, ChevronUp, ClipboardList, Eye, EyeOff, FileText, Heart, KeyRound, MessageSquare, Settings, Star, Syringe, Users } from "lucide-react";
import toast from "react-hot-toast";
import LoadingState from "../components/LoadingState";
import PageBanner from "../components/PageBanner";
import { supabase } from "../supabaseClient";
import { canUseFeature, featureKeys } from "../utils/featureAccess";

const defaultSections = ["profile", "quickActions", "favourites", "activity", "recent"];

const quickActions = [
  { title: "Clinical Protocols", path: "/protocols", type: "page", icon: ClipboardList, feature: featureKeys.clinicalProtocols },
  { title: "Formulary", path: "/drugs", type: "page", icon: Syringe, feature: featureKeys.drugDatabase },
  { title: "Clinical Tools", path: "/clinical-tools", type: "page", icon: Calculator, feature: featureKeys.clinicalTools },
  { title: "CPD Portfolio", path: "/cpd", type: "page", icon: FileText, feature: featureKeys.cpdTracker },
  { title: "Case Logs", path: "/caselogs", type: "page", icon: BriefcaseMedical, feature: featureKeys.caseLogs },
  { title: "Professional Network", path: "/network", type: "page", icon: Users, feature: featureKeys.network },
  { title: "Messages", path: "/messages", type: "page", icon: MessageSquare, feature: featureKeys.messaging },
  { title: "Vault", path: "/vault", type: "page", icon: KeyRound, feature: featureKeys.vault },
  { title: "Settings", path: "/settings", type: "page", icon: Settings }
];

export default function HomeDashboard({ user, profile, darkMode, unreadMessageCount = 0, unreadNotificationCount = 0, featureAccess, adminAccess = false }) {
  const [favourites, setFavourites] = useState([]);
  const [recentItems, setRecentItems] = useState([]);
  const [activity, setActivity] = useState({ protocols: [], cpd: [], cases: [] });
  const [sectionOrder, setSectionOrder] = useState(defaultSections);
  const [hiddenSections, setHiddenSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [layoutOpen, setLayoutOpen] = useState(false);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    setLoading(true);
    const [favRes, recentRes, prefRes, protocolsRes, cpdRes, casesRes] = await Promise.all([
      supabase.from("dashboard_favourites").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("recently_viewed").select("*").eq("user_id", user.id).order("viewed_at", { ascending: false }).limit(8),
      supabase.from("user_preferences").select("dashboard_config").eq("user_id", user.id).maybeSingle(),
      supabase.from("protocols").select("id, name, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
      supabase.from("cpd_reading").select("id, title, created_at, finished_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
      supabase.from("caselogs").select("id, title, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3)
    ]);

    if (!favRes.error) setFavourites(favRes.data || []);
    if (!recentRes.error) setRecentItems(recentRes.data || []);
    if (!prefRes.error && prefRes.data?.dashboard_config) {
      setSectionOrder(prefRes.data.dashboard_config.sectionOrder || defaultSections);
      setHiddenSections(prefRes.data.dashboard_config.hiddenSections || []);
    }
    setActivity({
      protocols: protocolsRes.error ? [] : protocolsRes.data || [],
      cpd: cpdRes.error ? [] : cpdRes.data || [],
      cases: casesRes.error ? [] : casesRes.data || []
    });
    setLoading(false);
  };

  const isFavourite = (path) => favourites.some(item => item.url === path && item.type === "page");

  const toggleFavourite = async (action) => {
    const existing = favourites.find(item => item.url === action.path && item.type === "page");
    if (existing) {
      const { error } = await supabase.from("dashboard_favourites").delete().eq("id", existing.id).eq("user_id", user.id);
      if (error) return toast.error("Could not remove favourite");
      setFavourites(prev => prev.filter(item => item.id !== existing.id));
      return;
    }

    const { data, error } = await supabase.from("dashboard_favourites").insert({
      user_id: user.id,
      type: action.type,
      title: action.title,
      url: action.path,
      metadata: {}
    }).select().single();

    if (error) return toast.error("Could not add favourite");
    setFavourites(prev => [data, ...prev]);
  };

  const moveSection = (section, direction) => {
    setSectionOrder(prev => {
      const index = prev.indexOf(section);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const saveLayout = async () => {
    const { error } = await supabase.from("user_preferences").upsert({
      user_id: user.id,
      dashboard_config: { sectionOrder, hiddenSections },
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) {
      toast.error("Could not save dashboard layout");
      return;
    }
    toast.success("Dashboard layout saved");
    setLayoutOpen(false);
  };

  const toggleSection = (section) => {
    setHiddenSections(prev => prev.includes(section) ? prev.filter(item => item !== section) : [...prev, section]);
  };

  const profileInitial = (profile?.full_name || user?.email || "V").charAt(0).toUpperCase();
  const orderedVisibleSections = useMemo(() => sectionOrder.filter(section => !hiddenSections.includes(section)), [hiddenSections, sectionOrder]);
  const visibleQuickActions = useMemo(
    () => quickActions.filter(action => canUseFeature(featureAccess, action.feature, adminAccess)),
    [featureAccess, adminAccess]
  );

  const renderSection = (section) => {
    if (section === "profile") {
      return (
        <section className={panelClass} key={section}>
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-2xl bg-[#71CFC2] text-[#062F63] grid place-items-center text-2xl font-black shrink-0 overflow-hidden">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : profileInitial}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-black truncate">{profile?.full_name || "Complete your profile"}</h2>
              <p className="text-sm opacity-70">{profile?.title || "Professional title"}</p>
              <p className="text-sm opacity-70">{profile?.practice_name || profile?.work_address || "Practice / organisation"}</p>
              <p className="text-sm opacity-70">{profile?.location || profile?.home_address || "Location"}</p>
              <p className="text-sm opacity-70 truncate">{profile?.email || user?.email}</p>
            </div>
            <Link to="/settings" className="rounded-lg bg-[#E8F8F5] text-[#0B3760] px-3 py-2 text-xs font-black">Edit</Link>
          </div>
        </section>
      );
    }

    if (section === "quickActions") {
      return (
        <section className={panelClass} key={section}>
          <h2 className="text-lg font-black mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {visibleQuickActions.map(action => {
              const Icon = action.icon;
              return (
                <div key={action.path} className={`rounded-lg border p-3 ${darkMode ? "border-white/10 bg-black/10" : "border-[#DCEDEA] bg-white"}`}>
                  <div className="flex justify-between gap-2 mb-3">
                    <Icon size={20} className="text-[#0F8F83]" />
                    <button onClick={() => toggleFavourite(action)} aria-label="Toggle favourite" className={isFavourite(action.path) ? "text-yellow-500" : "opacity-35"}>
                      <Star size={16} fill={isFavourite(action.path) ? "currentColor" : "none"} />
                    </button>
                  </div>
                  <Link to={action.path} className="font-black text-sm block">{action.title}</Link>
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    if (section === "favourites") {
      const visibleFavourites = favourites.filter(item => canUseFeature(featureAccess, featureForFavourite(item.url), adminAccess));
      return (
        <section className={panelClass} key={section}>
          <h2 className="text-lg font-black mb-4">Favourites</h2>
          {visibleFavourites.length === 0 ? <p className="text-sm opacity-60">Pin pages, drugs, protocols and resources for quick access.</p> : (
            <div className="space-y-2">
              {visibleFavourites.map(item => (
                <Link key={item.id} to={item.url || "/"} className={`flex items-center justify-between rounded-lg p-3 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
                  <span className="font-bold text-sm">{item.title}</span>
                  <Heart size={15} className="text-[#0F8F83]" />
                </Link>
              ))}
            </div>
          )}
        </section>
      );
    }

    if (section === "activity") {
      return (
        <section className={panelClass} key={section}>
          <h2 className="text-lg font-black mb-4">Activity Summary</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {canUseFeature(featureAccess, featureKeys.messaging, adminAccess) && <Summary label="Unread messages" value={unreadMessageCount} darkMode={darkMode} />}
            <Summary label="Notifications" value={unreadNotificationCount} darkMode={darkMode} />
          </div>
          {canUseFeature(featureAccess, featureKeys.clinicalProtocols, adminAccess) && <ActivityList title="Recent protocols" items={activity.protocols.map(item => item.name)} />}
          {canUseFeature(featureAccess, featureKeys.cpdTracker, adminAccess) && <ActivityList title="Recent CPD" items={activity.cpd.map(item => item.title)} />}
          {canUseFeature(featureAccess, featureKeys.caseLogs, adminAccess) && <ActivityList title="Recent cases" items={activity.cases.map(item => item.title)} />}
        </section>
      );
    }

    if (section === "recent") {
      const visibleRecentItems = recentItems.filter(item => canUseFeature(featureAccess, featureForFavourite(item.url), adminAccess));
      return (
        <section className={panelClass} key={section}>
          <h2 className="text-lg font-black mb-4">Recently Viewed</h2>
          {visibleRecentItems.length === 0 ? <p className="text-sm opacity-60">Recently opened drugs, protocols, cases and CPD records will appear here.</p> : (
            <div className="space-y-2">
              {visibleRecentItems.map(item => <div key={item.id} className="text-sm font-bold opacity-80">{item.title}</div>)}
            </div>
          )}
        </section>
      );
    }

    return null;
  };

  return (
    <div className="pb-8 space-y-5">
      <PageBanner title="Dashboard" subtitle="Your VetLearn hub for clinical tools, CPD, messages and saved resources." darkMode={darkMode} />

      <section className={panelClass}>
        <div className={`flex items-center justify-between gap-3 ${layoutOpen ? "mb-4" : ""}`}>
          <div>
            <h2 className="font-black text-lg">Dashboard Layout</h2>
            <p className="text-sm opacity-60">{layoutOpen ? "Reorder, hide or show sections." : "Customise section order and visibility."}</p>
          </div>
          <button
            onClick={layoutOpen ? saveLayout : () => setLayoutOpen(true)}
            className="rounded-lg bg-[#71CFC2] text-[#062F63] px-3 py-2 text-xs font-black shrink-0"
          >
            {layoutOpen ? "Save" : "Customise"}
          </button>
        </div>
        {layoutOpen && (
          <div className="space-y-2">
            {defaultSections.map(section => (
              <div key={section} className={`flex items-center justify-between gap-2 rounded-lg p-3 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
                <button onClick={() => toggleSection(section)} className="flex items-center gap-2 text-sm font-bold">
                  {hiddenSections.includes(section) ? <EyeOff size={16} /> : <Eye size={16} />}
                  {sectionLabel(section)}
                </button>
                <div className="flex gap-1">
                  <button onClick={() => moveSection(section, -1)} className="p-1 opacity-60"><ChevronUp size={16} /></button>
                  <button onClick={() => moveSection(section, 1)} className="p-1 opacity-60"><ChevronDown size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {loading ? <LoadingState label="Loading dashboard..." darkMode={darkMode} /> : orderedVisibleSections.map(renderSection)}
    </div>
  );
}

function Summary({ label, value, darkMode }) {
  return (
    <div className={`rounded-lg p-3 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
      <div className="text-xl font-black text-[#0F8F83]">{value}</div>
      <div className="text-xs font-bold opacity-65">{label}</div>
    </div>
  );
}

function ActivityList({ title, items }) {
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">{title}</h3>
      {items.length === 0 ? <p className="text-sm opacity-55">No recent items.</p> : (
        <div className="space-y-1">{items.map((item, index) => <div key={`${title}-${index}`} className="text-sm font-bold opacity-80 truncate">{item}</div>)}</div>
      )}
    </div>
  );
}

function sectionLabel(section) {
  const labels = {
    profile: "Profile",
    quickActions: "Quick actions",
    favourites: "Favourites",
    activity: "Activity",
    recent: "Recently viewed"
  };
  return labels[section] || section;
}

function featureForFavourite(path = "") {
  if (path === "/cpd") return featureKeys.cpdTracker;
  if (path === "/caselogs") return featureKeys.caseLogs;
  if (path === "/drugs") return featureKeys.drugDatabase;
  if (path === "/clinical-tools") return featureKeys.clinicalTools;
  if (path === "/network") return featureKeys.network;
  if (path === "/messages") return featureKeys.messaging;
  if (path === "/protocols") return featureKeys.clinicalProtocols;
  if (path === "/vault") return featureKeys.vault;
  return null;
}
