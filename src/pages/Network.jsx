import { useEffect, useState } from "react";
import { Check, Loader2, Search, Trash2, UserPlus, Users, X } from "lucide-react";
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
          requester:profiles!connections_requester_id_fkey(id, full_name, title, qualifications, email),
          receiver:profiles!connections_receiver_id_fkey(id, full_name, title, qualifications, email)
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
                    <div>
                      <div className="font-bold">{connection.colleague?.title} {connection.colleague?.full_name}</div>
                      <div className="text-xs opacity-60">{connection.colleague?.email || "Connected colleague"}</div>
                    </div>
                    <button onClick={() => handleRemoveConnection(connection.connection_id)} className="p-2 rounded-lg text-red-500 bg-red-50">
                      {busyId === connection.connection_id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={18} />}
                    </button>
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
