import React, { useState, useEffect } from "react";
import { Search, Plus, Share2, X, Loader2, Trash2, Edit3, ClipboardList } from "lucide-react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import PageBanner from "../components/PageBanner";

export default function Protocols({ user, darkMode }) {
  const [activeTab, setActiveTab] = useState("my_protocols");
  const [protocols, setProtocols] = useState([]);
  const [drugs, setDrugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", indication: "", drug_ids: [] });
  const [drugSearch, setDrugSearch] = useState("");
  const [isShareOpen, setIsShareOpen] = useState(null);
  const [friendsList, setFriendsList] = useState([]);
  const [shareBusyId, setShareBusyId] = useState(null);

  useEffect(() => {
    if (!user) return;
    loadAllData();
  }, [user, activeTab]);

  const loadAllData = async () => {
    setLoading(true);
    const { data: drugData } = await supabase.from("drugs").select("id, name, species, route").eq("active", true);
    setDrugs(drugData || []);

    let query = supabase.from("protocols").select("*").order("created_at", { ascending: false });
    if (activeTab === "my_protocols") query = query.eq("user_id", user.id);
    else if (activeTab === "network") query = query.neq("user_id", user.id);
    
    const { data: protoData, error } = await query;
    if (error) toast.error("Failed to load protocols");
    setProtocols(protoData || []);
    setLoading(false);
  };

  const handleSaveProtocol = async () => {
    if (!form.name.trim()) return toast.error("Title is required");
    const payload = { name: form.name.trim(), indication: form.indication.trim(), drug_ids: form.drug_ids, user_id: user.id };
    
    let error;
    if (editingId) ({ error } = await supabase.from("protocols").update(payload).eq("id", editingId).eq("user_id", user.id));
    else ({ error } = await supabase.from("protocols").insert(payload));

    if (error) toast.error(`Failed to save: ${error.message}`);
    else {
      toast.success("Protocol saved!");
      setIsEditorOpen(false);
      setEditingId(null);
      setForm({ name: "", indication: "", drug_ids: [] });
      loadAllData();
    }
  };

  const deleteProtocol = async (id) => {
    const { error } = await supabase.from("protocols").delete().eq("id", id).eq("user_id", user.id);
    if (error) toast.error("Could not delete protocol");
    else {
      setProtocols(prev => prev.filter(protocol => protocol.id !== id));
      toast.success("Protocol deleted");
    }
  };

  const openShareMenu = async (protocol) => {
    setIsShareOpen(protocol);
    const { data } = await supabase.from('connections').select(`requester:profiles!connections_requester_id_fkey(id, full_name), receiver:profiles!connections_receiver_id_fkey(id, full_name)`).eq('status', 'accepted').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
    const friends = (data || []).map(c => c.requester.id === user.id ? c.receiver : c.requester);
    setFriendsList(friends);
  };

  const confirmShare = async (friendId) => {
    setShareBusyId(friendId);
    const { error } = await supabase.from('shared_records').insert({ sender_id: user.id, receiver_id: friendId, record_type: 'protocol', record_id: String(isShareOpen.id), record_title: isShareOpen.name });
    if (!error) { toast.success("Shared!"); setIsShareOpen(null); }
    else toast.error("Failed to share");
    setShareBusyId(null);
  };

  const openEditor = (protocol = null) => {
    if (protocol) {
      setEditingId(protocol.id);
      setForm({ name: protocol.name || "", indication: protocol.indication || "", drug_ids: protocol.drug_ids || [] });
    } else {
      setEditingId(null);
      setForm({ name: "", indication: "", drug_ids: [] });
    }
    setIsEditorOpen(true);
  };

  const panelClass = darkMode ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]" : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";
  const fieldClass = `w-full rounded-lg p-3 text-sm mb-3 outline-none focus:ring-2 focus:ring-[#71CFC2]/50 ${darkMode ? "bg-black/20 text-white placeholder:text-slate-400" : "bg-slate-50 text-[#113247]"}`;

  const filteredProtocols = protocols.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="pb-8">
      {isEditorOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-2xl p-6 shadow-2xl ${darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]"}`}>
            <h2 className="text-xl font-black mb-4">{editingId ? "Edit Protocol" : "New Protocol"}</h2>
            <input className={fieldClass} placeholder="Protocol Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <input className={fieldClass} placeholder="Indication" value={form.indication} onChange={e => setForm({...form, indication: e.target.value})} />
            <label className="text-xs font-bold opacity-50 block mb-2">Search and select drugs</label>
            <input className={fieldClass} placeholder="Search drugs..." value={drugSearch} onChange={e => setDrugSearch(e.target.value)}/>
            <div className="h-40 overflow-y-auto mb-4 border rounded-lg p-2 dark:border-white/10">
              {drugs.filter(d => d.name.toLowerCase().includes(drugSearch.toLowerCase()) && !form.drug_ids.includes(d.id)).map(d => (
                <button key={d.id} onClick={() => setForm({...form, drug_ids: [...form.drug_ids, d.id]})} className="block w-full text-left p-2 hover:bg-[#71CFC2]/20 rounded text-sm mb-1">
                  {d.name} <span className="opacity-50 text-xs">({d.species} - {d.route})</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-6">
              {form.drug_ids.map(id => {
                const drug = drugs.find(d => d.id === id);
                return <span key={id} className="bg-[#71CFC2] text-[#062F63] px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2">{drug?.name || "Drug"} <X size={12} className="cursor-pointer" onClick={() => setForm({...form, drug_ids: form.drug_ids.filter(i => i !== id)})}/></span>
              })}
            </div>
            <button onClick={handleSaveProtocol} className="w-full bg-[#0F8F83] text-white py-3 rounded-lg font-bold">Save Protocol</button>
            <button onClick={() => { setIsEditorOpen(false); setEditingId(null); }} className="w-full mt-2 opacity-50 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {isShareOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-sm rounded-2xl p-6 ${darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]"}`}>
            <h2 className="text-lg font-black mb-4">Share with colleague</h2>
            {friendsList.length === 0 && <p className="opacity-50 text-sm mb-4">No connections found.</p>}
            {friendsList.map(f => (
               <button key={f.id} onClick={() => confirmShare(f.id)} className="w-full p-3 border-b flex justify-between font-bold">
                 {f.full_name} {shareBusyId === f.id ? <Loader2 className="animate-spin"/> : "Send"}
               </button>
            ))}
            <button onClick={() => setIsShareOpen(null)} className="w-full mt-4 opacity-50">Cancel</button>
          </div>
        </div>
      )}

      <PageBanner
        title="Clinical Protocols"
        subtitle="Create, manage and share treatment protocols."
        darkMode={darkMode}
        badges={[{ label: `${filteredProtocols.length} shown`, icon: <ClipboardList size={13} />, accent: true }]}
      />

      <div className="flex flex-col gap-4 mb-6">
        <div className={`${panelClass} !p-3 flex items-center gap-3`}>
          <Search size={18} className={darkMode ? "text-slate-400" : "text-slate-500"}/>
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search protocols..." className={`w-full bg-transparent outline-none text-sm font-bold ${darkMode ? "text-white placeholder:text-slate-400" : "text-[#113247]"}`} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {['my_protocols', 'network'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-2 rounded-full font-bold text-sm ${activeTab === t ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"}`}>{t.replace('_', ' ')}</button>
          ))}
        </div>
        <button onClick={() => openEditor()} className="bg-[#0F8F83] text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2">
          <Plus size={18} /> New Protocol
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? <div className={panelClass}><Loader2 className="animate-spin text-[#71CFC2]"/></div> : filteredProtocols.length === 0 ? <div className={panelClass}>No protocols found.</div> : filteredProtocols.map(p => (
          <div key={p.id} className={panelClass}>
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-lg">{p.name}</h3>
              <div className="flex gap-2">
                <button onClick={() => openShareMenu(p)} className="text-[#0F8F83]"><Share2 size={16}/></button>
                {p.user_id === user.id && (
                  <>
                    <button onClick={() => openEditor(p)}><Edit3 size={16}/></button>
                    <button onClick={() => deleteProtocol(p.id)} className="text-red-500"><Trash2 size={16}/></button>
                  </>
                )}
              </div>
            </div>
            <p className="text-sm opacity-60 mb-2">{p.indication}</p>
            <div className="flex flex-wrap gap-1">
              {p.drug_ids?.map(id => {
                const drug = drugs.find(d => String(d.id) === String(id));
                return drug ? <span key={id} className="text-[10px] bg-slate-100 dark:bg-black/20 px-2 py-1 rounded font-bold">{drug.name}</span> : null;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
