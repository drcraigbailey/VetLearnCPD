import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import { 
  Search, Plus, ClipboardList, ChevronRight, X, ChevronDown, 
  Share2, Users, Globe, Lock, Trash2, Edit, Copy, Loader2
} from "lucide-react";
import HeartbeatLoader from "../components/HeartbeatLoader";

// Reused Accordion Pattern from Formulary
const AccordionSection = React.memo(({ id, title, expandedSection, onToggle, darkMode, children }) => {
  if (!children) return null;
  const isOpen = expandedSection === id;
  return (
    <div className={`border-b ${darkMode ? "border-white/10" : "border-slate-200"} last:border-0`}>
      <button onClick={() => onToggle(id)} className={`w-full flex items-center justify-between py-4 text-left font-black text-[15px] transition-colors ${isOpen ? (darkMode ? "text-[#71CFC2]" : "text-[#0F8F83]") : (darkMode ? "text-white" : "text-[#113247]")}`}>
        {title} {isOpen ? <ChevronDown size={20} className="opacity-50"/> : <ChevronRight size={20} className="opacity-50" />}
      </button>
      {isOpen && <div className="pb-5 animate-in slide-in-from-top-2 duration-200">{children}</div>}
    </div>
  );
});

export default function Protocols({ user, darkMode }) {
  const [activeTab, setActiveTab] = useState("my_protocols");
  const [protocols, setProtocols] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Detail Modal States
  const [activeProtocol, setActiveProtocol] = useState(null);
  const [protocolSteps, setProtocolSteps] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [expandedSection, setExpandedSection] = useState("steps");

  // Sharing States (Reused from Drugs.jsx)
  const [sharingProtocol, setSharingProtocol] = useState(null);
  const [friendsList, setFriendsList] = useState([]);
  const [isSharingLoading, setIsSharingLoading] = useState(false);
  const [shareBusyId, setShareBusyId] = useState(null);

  const panelClass = darkMode ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]" : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";
  const fieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247]"}`;

  useEffect(() => {
    if (user) loadProtocols();
  }, [user, activeTab]);

  const loadProtocols = async () => {
    setLoading(true);
    try {
      let query = supabase.from("protocols").select(`*, author:profiles!protocols_user_id_fkey(full_name)`).order("created_at", { ascending: false });
      
      if (activeTab === "my_protocols") {
        query = query.eq("user_id", user.id);
      } else {
        // Shared / Network logic
        query = query.neq("user_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setProtocols(data || []);
    } catch (error) {
      toast.error("Failed to load protocols.");
    } finally {
      setLoading(false);
    }
  };

  const openProtocolDetails = useCallback(async (protocol) => {
    setActiveProtocol(protocol);
    setExpandedSection("steps");
    setLoadingDetails(true);

    try {
      // Promise.all architecture reused from Formulary
      const [{ data: stepsData }] = await Promise.all([
        supabase.from('protocol_steps').select('*').eq('protocol_id', protocol.id).order('step_number', { ascending: true })
      ]);
      setProtocolSteps(stepsData || []);
    } catch (err) {
      toast.error("Error fetching protocol details.");
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const deleteProtocol = async (id) => {
    if (!window.confirm("Delete this protocol?")) return;
    const { error } = await supabase.from("protocols").delete().eq("id", id).eq("user_id", user.id);
    if (!error) { toast.success("Protocol deleted"); loadProtocols(); setActiveProtocol(null); }
  };

  // Reused Sharing Architecture
  const openShareProtocolMenu = async (protocol) => {
    setSharingProtocol(protocol);
    setIsSharingLoading(true);
    try {
      const { data } = await supabase
        .from('connections')
        .select(`id, requester_id, receiver_id, requester:profiles!connections_requester_id_fkey(id, full_name, title), receiver:profiles!connections_receiver_id_fkey(id, full_name, title)`)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
        
      const friends = (data || []).map(conn => ({ connection_id: conn.id, colleague: conn.requester_id === user.id ? conn.receiver : conn.requester }));
      setFriendsList(friends);
    } catch (err) { toast.error("Could not load colleagues."); } finally { setIsSharingLoading(false); }
  };

  const confirmShareProtocol = async (friendId, protocol) => {
    setShareBusyId(friendId);
    try {
      const { error } = await supabase.from('shared_records').insert({ sender_id: user.id, receiver_id: friendId, record_type: 'protocol', record_id: String(protocol.id), record_title: protocol.name });
      if (error) throw error;
      toast.success(`Protocol shared successfully!`); setSharingProtocol(null);
    } catch (err) { toast.error("Failed to share protocol."); } finally { setShareBusyId(null); }
  };

  const filteredProtocols = useMemo(() => {
    return protocols.filter(p => 
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.species?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.indication?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [protocols, searchQuery]);

  return (
    <div className="pb-8">
      
      {/* SHARING MODAL (Reused from Drugs.jsx) */}
      {sharingProtocol && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl flex flex-col relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]"}`}>
            <button onClick={() => setSharingProtocol(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-500/20 transition"><X size={20} /></button>
            <h2 className="text-2xl font-black mb-1">Share Protocol</h2>
            <p className="text-sm opacity-70 mb-6">Select a colleague to share "{sharingProtocol.name}" with.</p>

            {isSharingLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#71CFC2]" size={24}/></div>
            ) : friendsList.length === 0 ? (
              <div className="text-center py-8 opacity-60 bg-black/5 dark:bg-white/5 rounded-lg text-sm p-4">No active colleagues found.</div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {friendsList.map(friend => (
                  <div key={friend.connection_id} className={`flex justify-between items-center p-3 rounded-xl border ${darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                    <div className="font-bold text-[15px]">{friend.colleague?.title} {friend.colleague?.full_name}</div>
                    <button onClick={() => confirmShareProtocol(friend.colleague.id, sharingProtocol)} disabled={shareBusyId === friend.colleague.id} className="bg-[#71CFC2] text-[#062F63] px-3 py-2 rounded-lg font-bold text-sm flex gap-2 items-center hover:opacity-90 transition">{shareBusyId === friend.colleague.id ? <Loader2 size={16} className="animate-spin"/> : "Send"}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PROTOCOL DETAIL MODAL */}
      {activeProtocol && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
          <div className={`w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-3xl overflow-y-auto sm:rounded-2xl shadow-2xl flex flex-col relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-[#F9FCFB] text-[#113247]"}`}>
            
            <div className={`sticky top-0 z-10 px-6 py-5 border-b backdrop-blur-md flex justify-between items-start ${darkMode ? "bg-[#0B242B]/90 border-white/10" : "bg-white/95 border-slate-200"}`}>
              <div className="w-full pr-4">
                <div className="flex justify-between items-start">
                  <h2 className="text-3xl font-black mb-2">{activeProtocol.name}</h2>
                  <button onClick={() => setActiveProtocol(null)} className="p-2 shrink-0 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"><X size={20} /></button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider mb-4 mt-2">
                  <span className="px-3 py-1 rounded bg-slate-100 dark:bg-white/10">{activeProtocol.species || "General"}</span>
                  <span className="px-3 py-1 rounded bg-[#E8F8F5] text-[#0F8F83] dark:bg-[#71CFC2]/20 dark:text-[#71CFC2]">Dr. {activeProtocol.author?.full_name}</span>
                </div>
                
                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-200 dark:border-white/10">
                  <button onClick={() => openShareProtocolMenu(activeProtocol)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10"><Share2 size={14}/> Share</button>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10"><Copy size={14}/> Duplicate</button>
                  {activeProtocol.user_id === user.id && (
                    <button onClick={() => deleteProtocol(activeProtocol.id)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"><Trash2 size={14}/> Delete</button>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6">
              {loadingDetails ? (
                <div className="flex justify-center py-10"><HeartbeatLoader size={48} /></div>
              ) : (
                <>
                  <div className="mb-6">
                    <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">Indication</h3>
                    <p className="text-sm">{activeProtocol.indication || "No specific indication provided."}</p>
                  </div>

                  <AccordionSection id="steps" title="Treatment Regimen" expandedSection={expandedSection} onToggle={setExpandedSection} darkMode={darkMode}>
                    {protocolSteps.length === 0 ? <p className="opacity-50 text-sm">No steps defined.</p> : (
                      <div className="space-y-3">
                        {protocolSteps.map((step, i) => (
                          <div key={i} className={`p-4 rounded-xl border ${darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                            <div className="text-[10px] font-black opacity-40 uppercase mb-1">Step {step.step_number}</div>
                            <div className="font-bold text-[#0F8F83] dark:text-[#71CFC2] mb-2">{step.instruction}</div>
                            {step.drug_name && (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mt-2 p-2 rounded bg-black/5 dark:bg-black/20">
                                <div><span className="opacity-50 block">Drug</span>{step.drug_name}</div>
                                <div><span className="opacity-50 block">Dose</span>{step.dosage}</div>
                                <div><span className="opacity-50 block">Route</span>{step.route}</div>
                                <div><span className="opacity-50 block">Freq</span>{step.frequency}</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionSection>

                  <AccordionSection id="notes" title="Clinical Notes & Monitoring" expandedSection={expandedSection} onToggle={setExpandedSection} darkMode={darkMode}>
                     <div className={`p-4 rounded-xl border ${darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                        <h4 className="text-xs font-black uppercase opacity-50 mb-1">Monitoring Requirements</h4>
                        <p className="text-sm mb-4">{activeProtocol.monitoring || "None specified."}</p>
                        <h4 className="text-xs font-black uppercase opacity-50 mb-1">Client Instructions</h4>
                        <p className="text-sm">{activeProtocol.client_instructions || "None specified."}</p>
                     </div>
                  </AccordionSection>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HEADER & TABS (Reused from Drugs.jsx) */}
      <div className={`relative overflow-hidden bg-gradient-to-br border rounded-lg p-6 mb-6 shadow-sm ${darkMode ? "from-[#12323A] to-[#0B242B] border-white/10 text-white" : "from-white to-[#DFF7F3] border-[#CDEBE7] text-[#113247]"}`}>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-black mb-2">Protocols</h1>
            <p className="text-sm opacity-80">Manage and share standardized clinical treatment regimens.</p>
          </div>
          <button className="bg-[#0F8F83] text-white px-4 py-2 rounded-lg font-bold flex gap-2 items-center shadow-md"><Plus size={18}/> New Protocol</button>
        </div>
      </div>

      <div className="flex overflow-x-auto gap-2 mb-6 pb-2 scrollbar-hide">
        {[{ id: "my_protocols", label: "My Protocols" }, { id: "network", label: "Network Feed" }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition ${activeTab === tab.id ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className={`flex items-center gap-2 px-4 mb-6 rounded-xl border ${darkMode ? "bg-white/5 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
        <Search size={18} className="opacity-50"/>
        <input placeholder="Search protocols..." className={`w-full py-4 outline-none bg-transparent text-sm font-bold`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><HeartbeatLoader size={80} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProtocols.map(p => (
            <div key={p.id} onClick={() => openProtocolDetails(p)} className={`${panelClass} cursor-pointer hover:border-[#71CFC2] transition-colors flex flex-col`}>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-black text-lg">{p.name}</h3>
                <ChevronRight size={20} className="opacity-30" />
              </div>
              <p className="text-sm opacity-70 mb-4 line-clamp-2">{p.indication || "General treatment protocol."}</p>
              <div className="mt-auto flex items-center justify-between text-xs font-bold">
                <span className={`px-2 py-1 rounded ${darkMode ? "bg-white/10" : "bg-slate-100"}`}>{p.species || "General"}</span>
                <span className="text-[#0F8F83] dark:text-[#71CFC2]">Dr. {p.author?.full_name}</span>
              </div>
            </div>
          ))}
          {filteredProtocols.length === 0 && <div className="col-span-full text-center py-10 opacity-50">No protocols found.</div>}
        </div>
      )}
    </div>
  );
}