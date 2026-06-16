import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Briefcase, Check, Globe, GraduationCap, Loader2, Mail, MapPin, MessageSquare, Phone, UserPlus, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../supabaseClient";

const PROFILE_FIELDS = "id, avatar_url, full_name, title, practice_name, location, email, phone, mobile, website, bio, qualifications, degrees, certifications, rcvs_number, areas_of_interest, memberships";

function getReactFiber(element) {
  let node = element;
  while (node) {
    const key = Object.keys(node).find((candidate) => candidate.startsWith("__reactFiber$"));
    if (key) return node[key];
    node = node.parentElement;
  }
  return null;
}

function findFiberProps(fiber, matcher) {
  let current = fiber;
  while (current) {
    const props = current.memoizedProps;
    if (props && matcher(props, current)) return props;
    current = current.return;
  }
  return null;
}

function normaliseText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isNetworkPage() {
  return window.location.pathname.toLowerCase().includes("network");
}

function getClickedPostAuthor(target, fiber) {
  const article = target.closest("article");
  if (!article || !article.firstElementChild?.contains(target)) return null;

  const props = findFiberProps(fiber, (candidate) => candidate.post?.author?.id);
  return props?.post?.author || null;
}

function getClickedSearchProfile(target, fiber) {
  const props = findFiberProps(fiber, (candidate, current) => {
    const componentName = current.type?.name || current.elementType?.name;
    return componentName === "SearchTab" && Array.isArray(candidate.searchResults);
  });

  if (!props?.searchResults?.length) return null;

  let card = target;
  while (card && card !== document.body) {
    const cardText = normaliseText(card.textContent);
    const match = props.searchResults.find((profile) => profile.full_name && cardText.includes(normaliseText(profile.full_name)));
    if (match) return match;
    card = card.parentElement;
  }

  return null;
}

function getProfileFromClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  if (!isNetworkPage()) return null;
  if (target.closest("button, a, input, textarea, select, label")) return null;

  const fiber = getReactFiber(target);
  if (!fiber) return null;

  return getClickedPostAuthor(target, fiber) || getClickedSearchProfile(target, fiber);
}

async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

async function getConnectionStatus(currentUserId, profileId) {
  if (!currentUserId || !profileId) return { isColleague: false, hasPendingRequest: false };

  const { data } = await supabase
    .from("connections")
    .select("id, requester_id, receiver_id, status")
    .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

  const matching = (data || []).filter((connection) => {
    const otherId = connection.requester_id === currentUserId ? connection.receiver_id : connection.requester_id;
    return otherId === profileId;
  });

  return {
    isColleague: matching.some((connection) => connection.status === "accepted"),
    hasPendingRequest: matching.some((connection) => connection.status === "pending")
  };
}

function NetworkProfileModalEnhancer() {
  const [seedProfile, setSeedProfile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isColleague, setIsColleague] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  const darkMode = useMemo(() => {
    return document.documentElement.classList.contains("dark") || document.body.classList.contains("dark") || Boolean(document.querySelector(".dark"));
  }, [seedProfile]);

  useEffect(() => {
    const handleClick = (event) => {
      const profileFromClick = getProfileFromClick(event);
      if (!profileFromClick?.id) return;
      event.preventDefault();
      event.stopPropagation();
      setSeedProfile(profileFromClick);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    if (!seedProfile?.id) return;

    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setProfile(seedProfile);

      const authedUser = await getCurrentUser();
      if (cancelled) return;
      setCurrentUser(authedUser);

      const [{ data }, status] = await Promise.all([
        supabase.from("profiles").select(PROFILE_FIELDS).eq("id", seedProfile.id).maybeSingle(),
        getConnectionStatus(authedUser?.id, seedProfile.id)
      ]);

      if (cancelled) return;
      setProfile({ ...seedProfile, ...(data || {}) });
      setIsColleague(status.isColleague);
      setHasPendingRequest(status.hasPendingRequest);
      setLoading(false);
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [seedProfile]);

  const closeModal = () => {
    setSeedProfile(null);
    setProfile(null);
    setBusy(false);
    setIsColleague(false);
    setHasPendingRequest(false);
  };

  const addColleague = async () => {
    if (!currentUser?.id || !profile?.id || busy) return;
    setBusy(true);

    const { error } = await supabase.from("connections").upsert(
      { requester_id: currentUser.id, receiver_id: profile.id, status: "pending" },
      { onConflict: "requester_id, receiver_id" }
    );

    setBusy(false);
    if (error) return toast.error("Could not send colleague request");

    setHasPendingRequest(true);
    toast.success("Connection request sent");
    window.dispatchEvent(new Event("networkUpdated"));
  };

  if (!seedProfile || !profile) return null;

  const modalClass = darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]";
  const softClass = darkMode ? "bg-white/10 border-white/10" : "bg-[#F0F6F5] border-[#DCEDEA]";
  const initials = profile.full_name?.charAt(0) || "V";
  const canAddColleague = profile.id && profile.id !== currentUser?.id && !isColleague;

  return (
    <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className={`w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl ${modalClass}`}>
        <div className="flex justify-between items-start gap-3 mb-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="h-16 w-16 rounded-2xl bg-[#71CFC2] text-[#062F63] grid place-items-center shrink-0 overflow-hidden text-2xl font-black">
              {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-black leading-tight truncate">{profile.full_name || "Colleague"}</h2>
              <p className="text-sm opacity-65">{profile.title || "Veterinary Professional"}</p>
            </div>
          </div>
          <button type="button" onClick={closeModal} className={`rounded-lg p-2 ${darkMode ? "bg-white/10 text-white" : "bg-[#F0F6F5] text-[#113247]"}`} aria-label="Close profile">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={30} className="animate-spin text-[#71CFC2]" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <ProfileRow icon={<Briefcase size={16} />} label="Practice" value={profile.practice_name} softClass={softClass} />
              <ProfileRow icon={<MapPin size={16} />} label="Location" value={profile.location} softClass={softClass} />
              <ProfileRow icon={<Mail size={16} />} label="Email" value={profile.email} softClass={softClass} />
              <ProfileRow icon={<Phone size={16} />} label="Phone" value={profile.mobile || profile.phone} softClass={softClass} />
              <ProfileRow icon={<Globe size={16} />} label="Website" value={profile.website} softClass={softClass} isLink />
              <ProfileRow icon={<GraduationCap size={16} />} label="Qualifications" value={profile.qualifications || profile.degrees || profile.certifications} softClass={softClass} />
            </div>

            {profile.bio && (
              <section className={`rounded-lg border p-4 ${softClass}`}>
                <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">About</h3>
                <p className="text-sm leading-6 opacity-80 whitespace-pre-wrap">{profile.bio}</p>
              </section>
            )}

            {(profile.areas_of_interest || profile.memberships || profile.rcvs_number) && (
              <section className={`rounded-lg border p-4 ${softClass}`}>
                <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">Professional Details</h3>
                {profile.rcvs_number && <p className="text-sm mb-2"><span className="font-black opacity-60">RCVS: </span>{profile.rcvs_number}</p>}
                {profile.areas_of_interest && <p className="text-sm mb-2"><span className="font-black opacity-60">Interests: </span>{profile.areas_of_interest}</p>}
                {profile.memberships && <p className="text-sm"><span className="font-black opacity-60">Memberships: </span>{profile.memberships}</p>}
              </section>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <a href={`/messages?colleague=${profile.id}`} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black flex items-center justify-center gap-2 transition hover:opacity-90">
                <MessageSquare size={18} /> Message
              </a>

              {canAddColleague && (
                hasPendingRequest ? (
                  <button type="button" disabled className={`w-full rounded-lg border p-3 font-black flex items-center justify-center gap-2 opacity-60 ${darkMode ? "border-white/10 bg-white/10 text-white" : "border-[#DCEDEA] bg-[#F0F6F5] text-[#113247]"}`}>
                    <Check size={18} /> Request Pending
                  </button>
                ) : (
                  <button type="button" onClick={addColleague} disabled={busy} className={`w-full rounded-lg border p-3 font-black flex items-center justify-center gap-2 transition disabled:opacity-50 ${darkMode ? "border-[#71CFC2]/40 bg-[#71CFC2]/10 text-[#71CFC2]" : "border-[#71CFC2] bg-[#E8F8F5] text-[#0B3760]"}`}>
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />} Add Colleague
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileRow({ icon, label, value, softClass, isLink = false }) {
  if (!value) return null;

  const content = isLink ? (
    <a href={String(value).startsWith("http") ? value : `https://${value}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#0F8F83] hover:underline break-all">
      {value}
    </a>
  ) : (
    <div className="text-sm font-bold break-words">{value}</div>
  );

  return (
    <div className={`rounded-lg border p-3 flex items-start gap-3 ${softClass}`}>
      <div className="mt-0.5 text-[#0F8F83] shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-black uppercase tracking-widest opacity-50 mb-1">{label}</div>
        {content}
      </div>
    </div>
  );
}

export function mountNetworkProfileModalEnhancer() {
  if (document.getElementById("network-profile-modal-enhancer-root")) return;

  const rootElement = document.createElement("div");
  rootElement.id = "network-profile-modal-enhancer-root";
  document.body.appendChild(rootElement);

  createRoot(rootElement).render(<NetworkProfileModalEnhancer />);
}
