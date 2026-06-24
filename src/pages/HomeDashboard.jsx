import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BriefcaseMedical, Calculator, ChevronDown, ChevronUp, ClipboardList, FileText, Heart, KeyRound, MessageSquare, Newspaper, Settings, Star, Syringe, Users } from "lucide-react";
import toast from "react-hot-toast";
import LoadingState from "../components/LoadingState";
import PageBanner from "../components/PageBanner";
import { QuickCalculatorPanel } from "../components/QuickCalculatorPanel";
import { supabase } from "../supabaseClient";
import { canUseFeature, featureKeys } from "../utils/featureAccess";

const defaultSections = ["profile", "quickActions", "networkWidget", "calculatorWidget", "favourites", "activity", "recent"];
const maxDashboardWidgets = 5;
const defaultHiddenSections = defaultSections.slice(maxDashboardWidgets);

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
  const [networkPosts, setNetworkPosts] = useState([]);
  const [networkAvailable, setNetworkAvailable] = useState(true);
  const [sectionOrder, setSectionOrder] = useState(defaultSections);
  const [hiddenSections, setHiddenSections] = useState(defaultHiddenSections);
  const [loading, setLoading] = useState(true);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [layoutFeedback, setLayoutFeedback] = useState("");
  const [movedSection, setMovedSection] = useState("");
  const [selectedWidgetToAdd, setSelectedWidgetToAdd] = useState("");
  const feedbackTimerRef = useRef(null);
  const firstWidgetRef = useRef(null);
  const didInitialDashboardScrollRef = useRef(false);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const canLoadNetwork = canUseFeature(featureAccess, featureKeys.network, adminAccess);
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
      setSectionOrder(normaliseSectionOrder(prefRes.data.dashboard_config.sectionOrder));
      setHiddenSections(cleanSectionList(prefRes.data.dashboard_config.hiddenSections));
    }
    setActivity({
      protocols: protocolsRes.error ? [] : protocolsRes.data || [],
      cpd: cpdRes.error ? [] : cpdRes.data || [],
      cases: casesRes.error ? [] : casesRes.data || []
    });

    if (canLoadNetwork) {
      const { data: connections, error: connectionsError } = await supabase
        .from("connections")
        .select("requester_id, receiver_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (connectionsError) {
        setNetworkPosts([]);
        setNetworkAvailable(false);
      } else {
        const allowedIds = [user.id];
        (connections || []).forEach(connection => {
          allowedIds.push(connection.requester_id === user.id ? connection.receiver_id : connection.requester_id);
        });

        const { data: posts, error: postsError } = await supabase
          .from("network_posts")
          .select(`
            id, author_id, body, shared_type, shared_title, visibility, post_category, created_at,
            author:profiles!network_posts_author_id_fkey(id, full_name, title, avatar_url)
          `)
          .eq("is_deleted", false)
          .or(`visibility.eq.network,and(visibility.eq.colleagues,author_id.in.(${allowedIds.join(",")}))`)
          .order("created_at", { ascending: false })
          .limit(4);

        setNetworkPosts(postsError ? [] : posts || []);
        setNetworkAvailable(!postsError);
      }
    } else {
      setNetworkPosts([]);
      setNetworkAvailable(true);
    }
    setLoading(false);
  }, [user, featureAccess, adminAccess]);

  useEffect(() => {
    const timer = window.setTimeout(loadDashboard, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  useEffect(() => {
    didInitialDashboardScrollRef.current = false;
  }, [user?.id]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
  }, []);

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

  const flashLayoutFeedback = (section, message) => {
    setLayoutFeedback(message);
    setMovedSection(section);
    toast.success(message);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setMovedSection(""), 1400);
  };

  const moveSection = (section, direction) => {
    const visibleOrder = orderedAvailableSections.filter(item => !hiddenSections.includes(item));
    const visibleIndex = visibleOrder.indexOf(section);
    const targetSection = visibleOrder[visibleIndex + direction];

    if (!targetSection) {
      const edgeMessage = direction < 0 ? `${sectionLabel(section)} is already at the top` : `${sectionLabel(section)} is already at the bottom`;
      setLayoutFeedback(edgeMessage);
      toast(edgeMessage);
      return;
    }

    const currentOrder = normaliseSectionOrder(sectionOrder);
    const index = currentOrder.indexOf(section);
    const nextIndex = currentOrder.indexOf(targetSection);

    const next = [...currentOrder];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setSectionOrder(next);
    setMovedSection(section);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setMovedSection(""), 1400);
  };

  const saveLayout = async () => {
    const cleanOrder = normaliseSectionOrder(sectionOrder).filter(section => availableSections.includes(section));
    const cleanHidden = limitVisibleSections(cleanOrder, hiddenSections, availableSections);
    const { error } = await supabase.from("user_preferences").upsert({
      user_id: user.id,
      dashboard_config: { sectionOrder: cleanOrder, hiddenSections: cleanHidden },
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) {
      toast.error("Could not save dashboard layout");
      return;
    }
    toast.success("Dashboard layout saved");
    setLayoutOpen(false);
  };

  const addSection = (section) => {
    if (!section) return;
    if (selectedWidgetCount >= maxDashboardWidgets) {
      const limitMessage = `Choose up to ${maxDashboardWidgets} dashboard widgets`;
      setLayoutFeedback(limitMessage);
      toast(limitMessage);
      return;
    }

    setHiddenSections(prev => prev.filter(item => item !== section));
    flashLayoutFeedback(section, `${sectionLabel(section)} added`);
  };

  const removeSection = (section) => {
    setHiddenSections(prev => prev.includes(section) ? prev : [...prev, section]);
    flashLayoutFeedback(section, `${sectionLabel(section)} removed`);
  };

  const profileInitial = (profile?.full_name || user?.email || "V").charAt(0).toUpperCase();
  const availableSections = defaultSections.filter(section => section !== "calculatorWidget" || (
    canUseFeature(featureAccess, featureKeys.clinicalTools, adminAccess)
    && canUseFeature(featureAccess, featureKeys.additionalCalculators, adminAccess)
  )).filter(section => section !== "networkWidget" || canUseFeature(featureAccess, featureKeys.network, adminAccess));
  const orderedAvailableSections = normaliseSectionOrder(sectionOrder).filter(section => availableSections.includes(section));
  const orderedVisibleSections = orderedAvailableSections.filter(section => !hiddenSections.includes(section)).slice(0, maxDashboardWidgets);
  const hiddenAvailableSections = orderedAvailableSections.filter(section => hiddenSections.includes(section));
  const addWidgetValue = hiddenAvailableSections.includes(selectedWidgetToAdd) ? selectedWidgetToAdd : hiddenAvailableSections[0] || "";
  const selectedWidgetCount = orderedVisibleSections.length;
  const visibleQuickActions = useMemo(
    () => quickActions.filter(action => canUseFeature(featureAccess, action.feature, adminAccess)),
    [featureAccess, adminAccess]
  );

  useEffect(() => {
    const cleanHidden = limitVisibleSections(orderedAvailableSections, hiddenSections, availableSections);
    if (sameSectionList(cleanHidden, hiddenSections)) return;
    setHiddenSections(cleanHidden);
  }, [availableSections, hiddenSections, orderedAvailableSections]);

  useEffect(() => {
    if (hiddenAvailableSections.includes(selectedWidgetToAdd)) return;
    setSelectedWidgetToAdd(hiddenAvailableSections[0] || "");
  }, [hiddenAvailableSections, selectedWidgetToAdd]);

  useEffect(() => {
    if (loading || orderedVisibleSections.length === 0 || didInitialDashboardScrollRef.current) return undefined;
    didInitialDashboardScrollRef.current = true;

    let cancelled = false;
    let secondFrame = null;
    const scrollToFirstWidget = () => {
      if (cancelled) return;
      firstWidgetRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    };

    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(scrollToFirstWidget);
    });
    const settleTimers = [180, 500].map(delay => window.setTimeout(scrollToFirstWidget, delay));

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
      settleTimers.forEach(timer => window.clearTimeout(timer));
    };
  }, [loading, orderedVisibleSections.length]);

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
              <p className="text-sm opacity-70">{profile?.practice_name || "Practice / organisation"}</p>
              <p className="text-sm opacity-70">{profile?.location || "Location"}</p>
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

    if (section === "calculatorWidget") {
      return (
        <QuickCalculatorPanel
          key={section}
          darkMode={darkMode}
          compact
          storageKey="vetlearn-dashboard-calculator-widget"
        />
      );
    }

    if (section === "networkWidget") {
      return (
        <section className={panelClass} key={section}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3 shrink-0`}>
                <Newspaper size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black leading-tight">Network</h2>
                <p className="text-sm opacity-60 leading-6">Recent posts from your professional feed.</p>
              </div>
            </div>
            <Link to="/network" className="shrink-0 rounded-lg bg-[#71CFC2] px-3 py-2 text-xs font-black text-[#062F63]">Open</Link>
          </div>
          {!networkAvailable ? (
            <p className="text-sm opacity-60">Network posts could not be loaded just now.</p>
          ) : networkPosts.length === 0 ? (
            <p className="text-sm opacity-60">Recent posts from colleagues and the network will appear here.</p>
          ) : (
            <div className="space-y-2">
              {networkPosts.map(post => (
                <Link key={post.id} to="/network" className={`block rounded-lg p-3 transition ${darkMode ? "bg-white/10 hover:bg-white/15" : "bg-[#F0F6F5] hover:bg-[#E8F8F5]"}`}>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-black">{post.author?.full_name || "VetLearn member"}</span>
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest opacity-45">{formatRelativeDate(post.created_at)}</span>
                  </div>
                  <p className="line-clamp-2 text-sm font-bold opacity-80">{post.shared_title || post.body || "Shared a network update."}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest opacity-50">
                    {post.post_category && <span>{post.post_category}</span>}
                    {post.shared_type && <span>{post.shared_type}</span>}
                  </div>
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
            <p className="text-sm opacity-60">{layoutOpen ? `Add, remove or reorder up to ${maxDashboardWidgets} widgets.` : `${selectedWidgetCount}/${maxDashboardWidgets} widgets shown.`}</p>
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
            <div className={`grid gap-2 rounded-lg p-3 sm:grid-cols-[1fr_auto] ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
              <select
                value={addWidgetValue}
                onChange={event => setSelectedWidgetToAdd(event.target.value)}
                disabled={hiddenAvailableSections.length === 0 || selectedWidgetCount >= maxDashboardWidgets}
                className={`w-full rounded-lg border-0 px-3 py-2 text-sm font-bold outline-none disabled:opacity-50 ${darkMode ? "bg-[#102C36] text-white" : "bg-white text-[#0B3760]"}`}
                aria-label="Choose widget to add"
              >
                {hiddenAvailableSections.length === 0 ? (
                  <option value="">No extra widgets available</option>
                ) : hiddenAvailableSections.map(section => (
                  <option key={section} value={section}>{sectionLabel(section)}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => addSection(addWidgetValue)}
                disabled={!addWidgetValue || selectedWidgetCount >= maxDashboardWidgets}
                className="rounded-lg bg-[#71CFC2] px-4 py-2 text-sm font-black text-[#062F63] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add widget
              </button>
            </div>
            {orderedVisibleSections.map((section, index) => (
              <div key={section} className={`flex items-center justify-between gap-2 rounded-lg p-3 transition ${movedSection === section ? "ring-2 ring-[#71CFC2]" : ""} ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
                <span className="min-w-0 truncate text-sm font-bold">{sectionLabel(section)}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => removeSection(section)}
                    className={`rounded-full px-3 py-1 text-[11px] font-black ${darkMode ? "bg-white/10 text-white" : "bg-white text-[#0B3760]"}`}
                  >
                    Remove
                  </button>
                  <button onClick={() => moveSection(section, -1)} disabled={index === 0} className="p-1 opacity-60 disabled:opacity-25" aria-label={`Move ${sectionLabel(section)} up`}><ChevronUp size={16} /></button>
                  <button onClick={() => moveSection(section, 1)} disabled={index === orderedVisibleSections.length - 1} className="p-1 opacity-60 disabled:opacity-25" aria-label={`Move ${sectionLabel(section)} down`}><ChevronDown size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {loading ? <LoadingState label="Loading dashboard..." darkMode={darkMode} /> : orderedVisibleSections.map((section, index) => (
        <div key={section} ref={index === 0 ? firstWidgetRef : null} className="scroll-mt-24">
          {renderSection(section)}
        </div>
      ))}
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

function formatRelativeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return "Now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function sectionLabel(section) {
  const labels = {
    profile: "Profile",
    quickActions: "Quick actions",
    networkWidget: "Network",
    calculatorWidget: "Calculator widget",
    favourites: "Favourites",
    activity: "Activity",
    recent: "Recently viewed"
  };
  return labels[section] || section;
}

function cleanSectionList(sections) {
  return Array.isArray(sections) ? sections.filter(section => defaultSections.includes(section)) : [];
}

function sameSectionList(first, second) {
  if (first.length !== second.length) return false;
  const secondSet = new Set(second);
  return first.every(item => secondSet.has(item));
}

function limitVisibleSections(order, hiddenSections, availableSections = defaultSections) {
  const availableSet = new Set(availableSections);
  const hiddenSet = new Set(cleanSectionList(hiddenSections).filter(section => availableSet.has(section)));
  let visibleCount = 0;

  normaliseSectionOrder(order)
    .filter(section => availableSet.has(section))
    .forEach(section => {
      if (hiddenSet.has(section)) return;
      visibleCount += 1;
      if (visibleCount > maxDashboardWidgets) hiddenSet.add(section);
    });

  return [...hiddenSet].filter(section => availableSet.has(section));
}

function normaliseSectionOrder(sections) {
  const clean = cleanSectionList(sections);
  return [
    ...clean,
    ...defaultSections.filter(section => !clean.includes(section))
  ];
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
