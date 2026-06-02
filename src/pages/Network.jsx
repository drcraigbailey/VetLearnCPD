import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Check, Globe, GraduationCap, Loader2, Mail, MapPin, MessageSquare, Phone, Search, Trash2, UserPlus, UserRound, Users, X } from "lucide-react";
import toast from "react-hot-toast";
import PageBanner from "../components/PageBanner";
import HeartbeatLoader from "../components/HeartbeatLoader";
import { supabase } from "../supabaseClient";

export default function Network({ user, darkMode = false }) {
  const [activeTab, setActiveTab] = useState("colleagues");
  const [connections, setConnections] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [selectedColleague, setSelectedColleague] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  useEffect(() => {
    if (user) loadNetworkData();

    const channel = supabase
      .channel(`network-${user?.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, () => {
        loadNetworkData();
        window.dispatchEvent(new Event("networkUpdated"));
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const loadNetworkData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: connData } = await supabase
        .from("connections")
        .select(`
          id, requester_id, receiver_id,
          requester:profiles!connections_requester_id_fkey(id, avatar_url, full_name, title, practice_name, location, qualifications, email),
          receiver:profiles!connections_receiver_id_fkey(id, avatar_url, full_name, title, practice_name, location, qualifications, email)
        `)
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

      setConnections((connData || []).map(conn => ({
        connection_id: conn.id,
        colleague: conn.requester_id === user.id ? conn.receiver : conn.requester
      })));

      const { data: reqData } = await supabase
        .from("connections")
        .select(`id, created_at, requester:profiles!connections_requester_id_fkey(id, full_name, title, qualifications)`)
        .eq("receiver_id", user.id)
        .eq("status", "pending");
      setRequests(reqData || []);

      const { data: sentReqData } = await supabase
        .from("connections")
        .select("receiver_id")
        .eq("requester_id", user.id)
        .eq("status", "pending");
      setSentRequests((sentReqData || []).map(request => request.receiver_id));
    } catch (error) {
      toast.error("Failed to load network data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delay = setTimeout(async () => {
      if (searchQuery.trim().length < 3) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, title, qualifications")
        .neq("id", user.id)
        .ilike("full_name", `%${searchQuery.trim()}%`)
        .limit(15);

      if (error) {
        toast.error("Search failed");
        setSearchResults([]);
      } else {
        const filtered = (data || []).filter(result =>
          !connections.some(connection => connection.colleague?.id === result.id) &&
          !requests.some(request => request.requester?.id === result.id)
        );
        setSearchResults(filtered);
      }
      setSearching(false);
    }, 400);

    return () => clearTimeout(delay);
  }, [searchQuery, connections, requests, user]);

  const openColleagueProfile = async (colleague) => {
    if (!colleague?.id) return;
    setSelectedColleague(colleague);
    setProfileLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, avatar_url, full_name, title, practice_name, location, email, phone, mobile, website, bio, qualifications, degrees, certifications, rcvs_number, areas_of_interest, memberships")
      .eq("id", colleague.id)
      .maybeSingle();

    if (error) toast.error("Could not load colleague profile");
    else setSelectedColleague({ ...colleague, ...(data || {}) });
    setProfileLoading(false);
  };

  const handleSendRequest = async (receiverId) => {
    setBusyId(receiverId);
    const { error } = await supabase.from("connections").upsert({
      requester_id: user.id,
      receiver_id: receiverId,
      status: "pending"
    }, { onConflict: "requester_id, receiver_id" });

    if (error) toast.error("Failed to send request");
    else {
      toast.success("Connection request sent");
      setSentRequests(prev => [...prev, receiverId]);
      window.dispatchEvent(new Event("networkUpdated"));
    }
    setBusyId(null);
  };

  const handleRespond = async (connectionId, status) => {
    setBusyId(connectionId);
    const { error } = await supabase.from("connections").update({ status }).eq("id", connectionId).eq("receiver_id", user.id);
    if (error) toast.error("Failed to update request");
    else {
      toast.success(status === "accepted" ? "Colleague added" : "Request declined");
      await loadNetworkData();
      window.dispatchEvent(new Event("networkUpdated"));
    }
    setBusyId(null);
  };

  const handleRemoveConnection = async (connectionId) => {
    setBusyId(connectionId);
    const { error } = await supabase.from("connections").delete().eq("id", connectionId);
    if (error) toast.error("Failed to remove colleague");
    else {
      setConnections(prev => prev.filter(connection => connection.connection_id !== connectionId));
      toast.success("Colleague removed");
      window.dispatchEvent(new Event("networkUpdated"));
    }
    setBusyId(null);
  };

  const tabClass = (tab) => `px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition ${
    activeTab === tab
      ? "bg-[#71CFC2] text-[#062F63]"
      : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"
  }`;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <HeartbeatLoader size={80} />
        <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2]">Loading Network...</p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {selectedColleague && (
        <ColleagueProfileModal
          colleague={selectedColleague}
          loading={profileLoading}
          darkMode={darkMode}
          onClose={() => setSelectedColleague(null)}
        />
      )}

      <PageBanner
        title="Professional Network"
        subtitle="Manage colleagues and professional connections."
        darkMode={darkMode}
        badges={[{ label: `${requests.length} pending`, icon: <UserPlus size={13} />, accent: true }]}
      />

      <div className="flex overflow-x-auto gap-2 mb-6 pb-2 scrollbar-hide">
        <button className={tabClass("colleagues")} onClick={() => setActiveTab("colleagues")}>Colleagues</button>
        <button className={tabClass("search")} onClick={() => setActiveTab("search")}>Find Colleagues</button>
      </div>

      {activeTab === "colleagues" && (
        <div className="space-y-6">
          {requests.length > 0 && (
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest opacity-60 mb-3 flex items-center gap-2"><UserPlus size={16}/> Pending Requests</h3>
              <div className="space-y-2">
                {requests.map(request => (
                  <div key={request.id} className={`${panelClass} flex justify-between items-center border-l-4 border-[#0F8F83]`}>
                    <div>
                      <div className="font-bold text-lg">{request.requester?.title} {request.requester?.full_name}</div>
                      <div className="text-xs opacity-70">{request.requester?.qualifications || "Veterinary Professional"}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleRespond(request.id, "accepted")} className="bg-[#71CFC2] text-[#062F63] p-2 rounded-lg font-bold flex items-center gap-1">
                        {busyId === request.id ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16}/> Accept</>}
                      </button>
                      <button onClick={() => handleRespond(request.id, "rejected")} className="bg-slate-100 text-slate-500 p-2 rounded-lg">
                        <X size={16}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-black uppercase tracking-widest opacity-60 mb-3 flex items-center gap-2"><Users size={16}/> My Colleagues</h3>
            {connections.length === 0 ? (
              <div className={`${panelClass} text-center opacity-60 py-8`}>You haven't added any colleagues yet.</div>
            ) : (
              <div className="space-y-2">
                {connections.map(connection => (
                  <div key={connection.connection_id} className={`${panelClass} flex justify-between items-center gap-4`}>
                    <button onClick={() => openColleagueProfile(connection.colleague)} className="min-w-0 flex-1 text-left flex items-center gap-3">
                      <div className="h-11 w-11 rounded-full bg-[#E8F8F5] text-[#0F8F83] grid place-items-center shrink-0 overflow-hidden font-black">
                        {connection.colleague?.avatar_url ? <img src={connection.colleague.avatar_url} alt="" className="h-full w-full object-cover" /> : connection.colleague?.full_name?.charAt(0) || <UserRound size={18} />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold truncate">{connection.colleague?.title} {connection.colleague?.full_name}</div>
                        <div className="text-xs opacity-60 truncate">{connection.colleague?.email || "Connected colleague"}</div>
                      </div>
                    </button>
                    <div className="flex gap-2 shrink-0">
                      <Link
                        to={`/messages?colleague=${connection.colleague?.id}`}
                        className="p-2 rounded-lg text-[#0F8F83] bg-[#E8F8F5]"
                        aria-label={`Message ${connection.colleague?.full_name || "colleague"}`}
                      >
                        <MessageSquare size={18} />
                      </Link>
                      <button onClick={() => handleRemoveConnection(connection.connection_id)} className="p-2 rounded-lg text-red-500 bg-red-50" aria-label={`Remove ${connection.colleague?.full_name || "colleague"}`}>
                        {busyId === connection.connection_id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={18} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "search" && (
        <div className="space-y-4">
          <div className={`flex items-center gap-2 px-4 rounded-xl border ${darkMode ? "bg-white/5 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
            {searching ? <Loader2 size={18} className="animate-spin text-[#71CFC2]"/> : <Search size={18} className={darkMode ? "text-slate-400" : "text-slate-500"}/>}            
            <input
              placeholder="Search colleagues by name..."
              className={`w-full py-4 outline-none bg-transparent text-sm font-bold ${darkMode ? "text-white placeholder:text-slate-500" : "text-[#113247]"}`}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          {searchQuery.trim().length > 2 && searchResults.length === 0 && !searching && (
            <div className="text-center opacity-60 py-4 text-sm">No new colleagues found matching "{searchQuery}"</div>
          )}

          <div className="space-y-2">
            {searchResults.map(result => (
              <div key={result.id} className={`${panelClass} flex justify-between items-center`}>
                <div>
                  <div className="font-bold text-lg">{result.title} {result.full_name}</div>
                  <div className="text-xs opacity-70">{result.qualifications || "Veterinary Professional"}</div>
                </div>
                {sentRequests.includes(result.id) ? (
                  <button disabled className="px-4 py-2 rounded-lg font-bold text-sm opacity-50 border">Pending</button>
                ) : (
                  <button onClick={() => handleSendRequest(result.id)} disabled={busyId === result.id} className="px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 bg-[#E8F8F5] text-[#0F8F83]">
                    {busyId === result.id ? <Loader2 size={16} className="animate-spin"/> : <UserPlus size={16}/>} Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ColleagueProfileModal({ colleague, loading, darkMode, onClose }) {
  const modalClass = darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]";
  const softClass = darkMode ? "bg-white/10 border-white/10" : "bg-[#F0F6F5] border-[#DCEDEA]";
  const initials = colleague?.full_name?.charAt(0) || "V";

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className={`w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl ${modalClass}`}>
        <div className="flex justify-between items-start gap-3 mb-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="h-16 w-16 rounded-2xl bg-[#71CFC2] text-[#062F63] grid place-items-center shrink-0 overflow-hidden text-2xl font-black">
              {colleague?.avatar_url ? <img src={colleague.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-black leading-tight truncate">{colleague?.full_name || "Colleague"}</h2>
              <p className="text-sm opacity-65">{colleague?.title || "Veterinary Professional"}</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-full ${softClass}`} aria-label="Close colleague profile"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <HeartbeatLoader size={64} />
            <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2]">Loading profile...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <ProfileRow icon={<Briefcase size={16} />} label="Practice" value={colleague?.practice_name} softClass={softClass} />
              <ProfileRow icon={<MapPin size={16} />} label="Location" value={colleague?.location} softClass={softClass} />
              <ProfileRow icon={<Mail size={16} />} label="Email" value={colleague?.email} softClass={softClass} />
              <ProfileRow icon={<Phone size={16} />} label="Phone" value={colleague?.mobile || colleague?.phone} softClass={softClass} />
              <ProfileRow icon={<Globe size={16} />} label="Website" value={colleague?.website} softClass={softClass} isLink />
              <ProfileRow icon={<GraduationCap size={16} />} label="Qualifications" value={colleague?.qualifications || colleague?.degrees || colleague?.certifications} softClass={softClass} />
            </div>

            {colleague?.bio && (
              <section className={`rounded-lg border p-4 ${softClass}`}>
                <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">About</h3>
                <p className="text-sm leading-6 opacity-80 whitespace-pre-wrap">{colleague.bio}</p>
              </section>
            )}

            {(colleague?.areas_of_interest || colleague?.memberships || colleague?.rcvs_number) && (
              <section className={`rounded-lg border p-4 ${softClass}`}>
                <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">Professional Details</h3>
                {colleague?.rcvs_number && <p className="text-sm mb-2"><span className="font-black opacity-60">RCVS: </span>{colleague.rcvs_number}</p>}
                {colleague?.areas_of_interest && <p className="text-sm mb-2"><span className="font-black opacity-60">Interests: </span>{colleague.areas_of_interest}</p>}
                {colleague?.memberships && <p className="text-sm"><span className="font-black opacity-60">Memberships: </span>{colleague.memberships}</p>}
              </section>
            )}

            <Link to={`/messages?colleague=${colleague?.id}`} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black flex items-center justify-center gap-2">
              <MessageSquare size={18} /> Message Colleague
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileRow({ icon, label, value, softClass, isLink = false }) {
  if (!value) return null;
  const content = isLink ? (
    <a href={value} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#0F8F83] break-all">{value}</a>
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
