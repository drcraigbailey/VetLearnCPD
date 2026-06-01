import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import { 
  Users, Search, UserPlus, Check, X, Loader2, 
  Building2, UserCircle, Trash2, Mail, AlertTriangle
} from "lucide-react";
import HeartbeatLoader from "../components/HeartbeatLoader";

export default function Network({ user, darkMode = false }) {
  const [activeTab, setActiveTab] = useState("colleagues");
  
  // State
  const [connections, setConnections] = useState([]);
  const [requests, setRequests] = useState([]); 
  const [sentRequests, setSentRequests] = useState([]); 
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // View Modals State
  const [viewingColleague, setViewingColleague] = useState(null); 
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); 

  // Loading States
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  useEffect(() => {
    if (user) loadNetworkData();
  }, [user]);

  const loadNetworkData = async () => {
    setLoading(true);
    try {
      // 1. Load active connections
      const { data: connData } = await supabase
        .from('connections')
        .select(`
          id, requester_id, receiver_id, 
          requester:profiles!connections_requester_id_fkey(id, full_name, title, qualifications, email, rcvs_number, work_address), 
          receiver:profiles!connections_receiver_id_fkey(id, full_name, title, qualifications, email, rcvs_number, work_address)
        `)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

      const formattedConnections = (connData || []).map(conn => {
        const isRequester = conn.requester_id === user.id;
        return {
          connection_id: conn.id,
          colleague: isRequester ? conn.receiver : conn.requester
        };
      });
      setConnections(formattedConnections);

      // 2. Load incoming requests
      const { data: reqData } = await supabase
        .from('connections')
        .select(`id, created_at, requester:profiles!connections_requester_id_fkey(id, full_name, title, qualifications)`)
        .eq('receiver_id', user.id)
        .eq('status', 'pending');
      setRequests(reqData || []);

      // 3. Load outgoing requests
      const { data: sentReqData } = await supabase
        .from('connections')
        .select('receiver_id')
        .eq('requester_id', user.id)
        .eq('status', 'pending');
      setSentRequests((sentReqData || []).map(r => r.receiver_id));

    } catch (err) {
      toast.error("Failed to load network data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delay = setTimeout(async () => {
      if (searchQuery.trim().length >= 3) {
        setSearching(true);
        try {
          const { data: results, error } = await supabase
            .from('profiles')
            .select('id, full_name, title, qualifications')
            .neq('id', user.id)
            .ilike('full_name', `%${searchQuery.trim()}%`)
            .limit(15);

          if (error) {
             console.error("Search failed:", error);
             setSearchResults([]);
             return;
          }

          const filtered = (results || []).filter(r => 
            !connections.some(c => c.colleague?.id === r.id) &&
            !requests.some(req => req.requester?.id === r.id)
          );
          
          setSearchResults(filtered);

        } catch (err) {
          console.error("Search exception:", err);
        } finally {
          setSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 400); 
    return () => clearTimeout(delay);
  }, [searchQuery, connections, requests, user]);

  const handleSendRequest = async (receiverId) => {
    setBusyId(receiverId);
    try {
      const { error } = await supabase.from('connections').upsert({ 
        requester_id: user.id, 
        receiver_id: receiverId, 
        status: 'pending' 
      }, { onConflict: 'requester_id, receiver_id' });
      
      if (error) throw error;
      
      toast.success("Connection request sent!");
      setSentRequests(prev => [...prev, receiverId]);
    } catch (err) {
      console.error("Connection Request Error:", err);
      toast.error("Failed to send request.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRespond = async (connectionId, status) => {
    setBusyId(connectionId);
    try {
      const { error } = await supabase.from('connections').update({ status }).eq('id', connectionId);
      if (error) throw error;
      toast.success(status === 'accepted' ? "Colleague added!" : "Request declined");
      loadNetworkData(); 
    } catch (err) {
      toast.error("Failed to update request");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveConnection = async (connectionId) => {
    setBusyId(connectionId);
    try {
      const { error } = await supabase.from('connections').delete().eq('id', connectionId);
      if (error) throw error;
      
      // Instantly remove from UI without refresh
      setConnections(prev => prev.filter(c => c.connection_id !== connectionId));
      toast.success("Colleague removed");
    } catch (err) {
      toast.error("Failed to remove colleague");
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null); 
    }
  };

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

      {/* --- MODAL: Confirm Delete Colleague --- */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl flex flex-col relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-[#F9FCFB] text-[#113247]"}`}>
            
            <div className="flex justify-center mb-4 text-red-500 bg-red-100 dark:bg-red-500/20 w-16 h-16 rounded-full items-center mx-auto">
              <AlertTriangle size={32} />
            </div>

            <h3 className="text-xl font-black mb-2 text-center">Remove Colleague?</h3>
            <p className="text-sm opacity-80 mb-6 text-center">
              Are you sure you want to remove this colleague from your network? You will no longer be able to share records with them.
            </p>
            
            <div className="flex gap-3 mt-auto">
              <button 
                onClick={() => setConfirmDeleteId(null)} 
                disabled={busyId === confirmDeleteId}
                className={`flex-1 p-3 rounded-lg font-bold transition ${darkMode ? "bg-white/10 hover:bg-white/20" : "bg-slate-100 hover:bg-slate-200"}`}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleRemoveConnection(confirmDeleteId)}
                disabled={busyId === confirmDeleteId}
                className="flex-1 bg-red-500 text-white rounded-lg p-3 font-bold flex justify-center items-center gap-2 hover:bg-red-600 disabled:opacity-50 transition"
              >
                {busyId === confirmDeleteId ? <Loader2 size={16} className="animate-spin"/> : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: View Colleague Profile --- */}
      {viewingColleague && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl flex flex-col relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-[#F9FCFB] text-[#113247]"}`}>
            <button onClick={() => setViewingColleague(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-500/20 transition">
              <X size={20} />
            </button>
            
            <div className="flex flex-col items-center mb-6 mt-4">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center font-black text-4xl mb-4 shadow-inner ${darkMode ? "bg-[#71CFC2]/20 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0F8F83]"}`}>
                {(viewingColleague.full_name || "?")[0].toUpperCase()}
              </div>
              <h2 className="text-2xl font-black text-center">{viewingColleague.title} {viewingColleague.full_name}</h2>
              <p className="text-sm font-bold opacity-70 mt-1">{viewingColleague.qualifications || "Veterinary Professional"}</p>
            </div>

            <div className="space-y-3">
              {viewingColleague.email && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <Mail size={18} className="opacity-50 shrink-0" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-50">Email</div>
                    <div className="text-sm font-bold break-all">{viewingColleague.email}</div>
                  </div>
                </div>
              )}
              
              {viewingColleague.rcvs_number && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <UserCircle size={18} className="opacity-50 shrink-0" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-50">RCVS Number</div>
                    <div className="text-sm font-bold">{viewingColleague.rcvs_number}</div>
                  </div>
                </div>
              )}

              {viewingColleague.work_address ? (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <Building2 size={18} className="opacity-50 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-50">Work / Practice Address</div>
                    <div className="text-sm font-bold whitespace-pre-wrap">{viewingColleague.work_address}</div>
                  </div>
                </div>
              ) : (
                <div className="text-center opacity-50 text-xs py-4 italic">No further contact information provided.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`relative overflow-hidden bg-gradient-to-br border rounded-lg p-6 mb-6 shadow-sm ${darkMode ? "from-[#12323A] to-[#0B242B] border-white/10 text-white" : "from-white to-[#DFF7F3] border-[#CDEBE7] text-[#113247]"}`}>
        <div className="relative">
          <h1 className="text-3xl font-black mb-2">My Network</h1>
          <p className="text-sm opacity-80">Connect with colleagues and expand your professional network.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-2 mb-6 pb-2 scrollbar-hide">
        {[{ id: "colleagues", label: "Colleagues" }, { id: "search", label: "Find Colleagues" }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition ${activeTab === tab.id ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="animate-in fade-in">
        
        {/* TAB 1: COLLEAGUES & REQUESTS */}
        {activeTab === "colleagues" && (
          <div className="space-y-6">
            
            {requests.length > 0 && (
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest opacity-60 mb-3 flex items-center gap-2"><UserPlus size={16}/> Pending Requests</h3>
                <div className="space-y-2">
                  {requests.map(req => (
                    <div key={req.id} className={`${panelClass} flex justify-between items-center border-l-4 border-[#0F8F83]`}>
                      <div>
                        <div className="font-bold text-lg">{req.requester?.title} {req.requester?.full_name}</div>
                        <div className="text-xs opacity-70">{req.requester?.qualifications || "Veterinary Professional"}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleRespond(req.id, 'accepted')} className="bg-[#71CFC2] text-[#062F63] p-2 rounded-lg font-bold flex items-center gap-1">
                          {busyId === req.id ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16}/> Accept</>}
                        </button>
                        <button onClick={() => handleRespond(req.id, 'rejected')} className={`p-2 rounded-lg transition ${darkMode ? "bg-white/5 text-slate-300 hover:bg-red-500/20" : "bg-slate-100 text-slate-500 hover:bg-red-50"}`}>
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
                <div className={`${panelClass} text-center opacity-60 py-8`}>You haven't added any colleagues yet. Use the 'Find Colleagues' tab to build your network.</div>
              ) : (
                <div className="space-y-2">
                  {connections.map(conn => (
                    <div key={conn.connection_id} className={`${panelClass} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${darkMode ? "bg-[#71CFC2]/20 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0F8F83]"}`}>
                          {(conn.colleague?.full_name || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold">{conn.colleague?.title} {conn.colleague?.full_name}</div>
                          <div className="text-xs opacity-60">Connected Colleague</div>
                        </div>
                      </div>
                      
                      <div className="flex w-full sm:w-auto gap-2">
                        <button 
                          onClick={() => setViewingColleague(conn.colleague)} 
                          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-bold text-sm transition ${darkMode ? "bg-white/10 hover:bg-white/20 text-white" : "bg-[#E8F8F5] text-[#0F8F83] hover:bg-[#d4f1ec]"}`}
                        >
                          View Profile
                        </button>
                        
                        <button 
                          onClick={() => setConfirmDeleteId(conn.connection_id)}
                          title="Remove Connection"
                          className={`p-2 rounded-lg font-bold transition flex items-center justify-center shrink-0 ${darkMode ? "text-red-400 bg-red-500/10 hover:bg-red-500/20" : "text-red-500 bg-red-50 hover:bg-red-100"}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: SEARCH */}
        {activeTab === "search" && (
          <div className="space-y-4">
            <div className={`flex items-center gap-2 px-4 rounded-xl border ${darkMode ? "bg-white/5 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
              {searching ? <Loader2 size={18} className="animate-spin text-[#71CFC2]"/> : <Search size={18} className={darkMode ? "text-slate-400" : "text-slate-500"}/>}
              <input
                placeholder="Search colleagues by name..."
                className={`w-full py-4 outline-none bg-transparent text-sm font-bold ${darkMode ? "text-white placeholder:text-slate-500" : "text-[#113247]"}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
                    <button disabled className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 opacity-50 border ${darkMode ? "border-white/20 text-white" : "border-slate-300 text-slate-500"}`}>
                      Pending
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleSendRequest(result.id)}
                      disabled={busyId === result.id}
                      className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition ${darkMode ? "bg-white/10 hover:bg-white/20 text-white" : "bg-[#E8F8F5] text-[#0F8F83] hover:bg-[#d4f1ec]"}`}
                    >
                      {busyId === result.id ? <Loader2 size={16} className="animate-spin"/> : <UserPlus size={16}/>}
                      Connect
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}