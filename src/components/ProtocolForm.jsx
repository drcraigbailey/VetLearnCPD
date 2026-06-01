import { useState, useEffect } from "react";
import { Search, Plus, Bookmark, Share2, Users, Globe, Lock, ChevronRight } from "lucide-react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import ProtocolForm from "../components/ProtocolForm";

export default function Protocols({ user, darkMode }) {
  const [activeTab, setActiveTab] = useState("network"); // 'my_protocols', 'network', 'saved'
  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadProtocols();
  }, [user, activeTab]);

  const loadProtocols = async () => {
    setLoading(true);
    try {
      let query = supabase.from("drug_protocols").select(`
        *,
        author:profiles!drug_protocols_author_id_fkey(full_name),
        protocol_saves(count),
        protocol_comments(count)
      `).order("created_at", { ascending: false });

      if (activeTab === "my_protocols") {
        query = query.eq("author_id", user.id);
      } else if (activeTab === "network") {
        query = query.neq("author_id", user.id); // Network/Public feed
      } else if (activeTab === "saved") {
        // Handle saved protocols through inner join logic
        const { data: savedIds } = await supabase.from("protocol_saves").select("protocol_id").eq("user_id", user.id);
        const ids = savedIds?.map(s => s.protocol_id) || [];
        if (ids.length > 0) {
          query = query.in("id", ids);
        } else {
          setProtocols([]);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setProtocols(data || []);
    } catch (error) {
      console.error("Error loading protocols:", error);
      toast.error("Failed to load protocols");
    } finally {
      setLoading(false);
    }
  };

  const saveProtocol = async (protocolId) => {
    const { error } = await supabase.from("protocol_saves").insert({ protocol_id: protocolId, user_id: user.id });
    if (!error) {
      toast.success("Protocol saved to your library");
      loadProtocols();
    } else {
      toast.error("You have already saved this protocol");
    }
  };

  const filteredProtocols = protocols.filter(p => 
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.species?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.indication?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getVisibilityIcon = (visibility) => {
    switch(visibility) {
      case 'public': return <Globe size={14} className="text-blue-500" />;
      case 'connections': return <Users size={14} className="text-[#0F8F83]" />;
      default: return <Lock size={14} className="text-slate-400" />;
    }
  };

  const panelBg = darkMode ? "bg-[#0B242B] border-white/10" : "bg-white border-slate-200";
  const textColor = darkMode ? "text-slate-200" : "text-[#113247]";

  return (
    <div className="flex flex-col gap-6 relative">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className={`text-2xl font-black ${textColor}`}>Clinical Protocols</h1>
          <p className="text-sm opacity-70">Share and discover drug regimens with your network</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)} 
          className="flex items-center gap-2 bg-[#0F8F83] hover:bg-[#0B6B62] text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-sm"
        >
          <Plus size={18} /> New Protocol
        </button>
      </div>

      {/* Tabs & Search */}
      <div className={`flex flex-col md:flex-row gap-4 p-2 rounded-2xl border ${panelBg}`}>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar flex-1">
          {[
            { id: "network", label: "Network Feed" },
            { id: "my_protocols", label: "My Protocols" },
            { id: "saved", label: "Saved" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${
                activeTab === tab.id 
                  ? "bg-[#71CFC2] text-[#0B3760] shadow-sm" 
                  : `hover:bg-black/5 dark:hover:bg-white/10 ${textColor} opacity-70 hover:opacity-100`
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className={`flex items-center px-3 py-2 rounded-xl border ${darkMode ? "bg-black/20 border-white/10" : "bg-slate-50 border-slate-200"}`}>
          <Search size={16} className="opacity-50 mr-2" />
          <input 
            type="text" 
            placeholder="Search protocols..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`bg-transparent border-none outline-none text-sm w-full md:w-48 ${textColor}`}
          />
        </div>
      </div>

      {/* Protocol Feed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center opacity-50 font-medium">Loading protocols...</div>
        ) : filteredProtocols.length === 0 ? (
          <div className="col-span-full py-12 text-center opacity-50 font-medium">
            No protocols found in this view.
          </div>
        ) : (
          filteredProtocols.map(protocol => (
            <div key={protocol.id} className={`p-5 rounded-2xl border flex flex-col gap-3 transition-all hover:scale-[1.01] ${panelBg}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {getVisibilityIcon(protocol.visibility)}
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                      {protocol.visibility} • v{protocol.version}
                    </span>
                  </div>
                  <h3 className={`font-black text-lg ${textColor}`}>{protocol.title}</h3>
                  <p className="text-xs font-bold text-[#0F8F83] mt-1">Dr. {protocol.author?.full_name}</p>
                </div>
                {protocol.author_id !== user.id && (
                  <button 
                    onClick={() => saveProtocol(protocol.id)}
                    className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#0F8F83] dark:text-[#71CFC2] transition-colors"
                    title="Save to Library"
                  >
                    <Bookmark size={18} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                <div className={`p-2 rounded-lg ${darkMode ? "bg-white/5" : "bg-slate-50"}`}>
                  <span className="text-[10px] opacity-50 block mb-1 uppercase font-bold">Species</span>
                  <span className="font-medium">{protocol.species || "General"}</span>
                </div>
                <div className={`p-2 rounded-lg ${darkMode ? "bg-white/5" : "bg-slate-50"}`}>
                  <span className="text-[10px] opacity-50 block mb-1 uppercase font-bold">Indication</span>
                  <span className="font-medium truncate block" title={protocol.indication}>{protocol.indication || "Not specified"}</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-inherit opacity-70 text-xs font-medium">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1"><Bookmark size={14} /> {protocol.protocol_saves?.[0]?.count || 0} Saves</span>
                  <span className="flex items-center gap-1"><Share2 size={14} /> Share</span>
                </div>
                <button className="flex items-center gap-1 text-[#0F8F83] dark:text-[#71CFC2] font-bold hover:opacity-80">
                  View Protocol <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Protocol Form Modal Overlay */}
      {isFormOpen && (
        <ProtocolForm 
          user={user} 
          darkMode={darkMode} 
          onClose={() => setIsFormOpen(false)} 
          onSuccess={loadProtocols} 
        />
      )}
    </div>
  );
}