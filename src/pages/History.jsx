import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Search, Download, Clock3, Trash2, Save, Sparkles, Loader2, ExternalLink, Share2, X } from "lucide-react";
import toast from "react-hot-toast";
import { exportCPD } from "../utils/pdfExport";
import { generateReflection } from "../utils/aiReflection";
import HeartbeatLoader from "../components/HeartbeatLoader";

export default function History({user,darkMode=false}){
  const [history,setHistory]=useState([])
  const [search,setSearch]=useState("")
  const [loading,setLoading]=useState(true)
  const [loadingId,setLoadingId]=useState(null)
  const [aiEnabled, setAiEnabled] = useState(false)

  // Network Sharing State
  const [sharingItem, setSharingItem] = useState(null);
  const [friendsList, setFriendsList] = useState([]);
  const [isSharingLoading, setIsSharingLoading] = useState(false);
  const [shareBusyId, setShareBusyId] = useState(null);

  useEffect(()=>{
    loadHistory()
    const checkAiStatus = () => { setAiEnabled(localStorage.getItem("vetlearn-ai-enabled") === "true"); };
    checkAiStatus();
    const refresh=()=>loadHistory()
    window.addEventListener("cpdUpdated",refresh)
    window.addEventListener("settingsUpdated", checkAiStatus);
    return () => {
      window.removeEventListener("cpdUpdated",refresh)
      window.removeEventListener("settingsUpdated", checkAiStatus);
    }
  },[user])

  const loadHistory=async()=>{
    if(!user) return
    setLoading(true)
    const {data}=await supabase.from("cpd_reading").select("*").eq("user_id",user.id).order("created_at",{ascending:false})
    setHistory(data||[])
    setLoading(false)
  }

  const deleteEntry=async(id)=>{
    setLoadingId(id)
    const {error}=await supabase.from("cpd_reading").delete().eq("id",id).eq("user_id",user.id)
    if(error){ toast.error(error.message); setLoadingId(null); return; }
    setHistory(history.filter(item=>item.id!==id))
    window.dispatchEvent(new Event("cpdUpdated"))
    toast.success("Entry deleted")
    setLoadingId(null)
  }

  const saveReflection=async(item)=>{
    setLoadingId(item.id)
    const {error}=await supabase.from("cpd_reading").update({ reflection:item.user_reflection, user_reflection:item.user_reflection }).eq("id",item.id).eq("user_id",user.id)
    if(error){ toast.error(error.message); setLoadingId(null); return; }
    toast.success("Reflection saved")
    setLoadingId(null)
  }

  const generateAIReflection=async(item)=>{
    setLoadingId(item.id)
    const ai=await generateReflection(item.title,item.category)
    const updated=history.map(h=>h.id===item.id ? {...h,user_reflection:ai} : h)
    setHistory(updated)
    setLoadingId(null)
  }

  const updateLocal=(id,value)=>{
    setHistory(history.map(item=>item.id===id ? {...item,user_reflection:value} : item))
  }

  // --- Network Sharing Functions ---
  const openShareMenu = async (item) => {
    setSharingItem(item);
    setIsSharingLoading(true);
    try {
      const { data } = await supabase
        .from('connections')
        .select(`id, requester_id, receiver_id, requester:profiles!connections_requester_id_fkey(id, full_name, title), receiver:profiles!connections_receiver_id_fkey(id, full_name, title)`)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
        
      const friends = (data || []).map(conn => ({
        connection_id: conn.id,
        colleague: conn.requester_id === user.id ? conn.receiver : conn.requester
      }));
      setFriendsList(friends);
    } catch (err) {
      toast.error("Could not load colleagues.");
    } finally {
      setIsSharingLoading(false);
    }
  };

  const confirmShare = async (friendId, item) => {
    setShareBusyId(friendId);
    try {
      const { error } = await supabase.from('shared_records').insert({
        sender_id: user.id, receiver_id: friendId, record_type: 'cpd_read', record_id: String(item.id), record_title: item.title
      });
      if (error) throw error;
      toast.success(`CPD shared successfully!`);
      setSharingItem(null);
    } catch (err) {
      toast.error("Failed to share CPD.");
    } finally {
      setShareBusyId(null);
    }
  };

  const filtered=history.filter(item=>item.title?.toLowerCase().includes(search.toLowerCase()))

  return(
    <div>
      {/* Network Share Modal */}
      {sharingItem && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl flex flex-col relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]"}`}>
            <button onClick={() => setSharingItem(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-500/20 transition"><X size={20} /></button>
            <h2 className="text-2xl font-black mb-1">Share CPD Record</h2>
            <p className="text-sm opacity-70 mb-6">Select a colleague to share "{sharingItem.title}" with.</p>

            {isSharingLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#71CFC2]" size={24}/></div>
            ) : friendsList.length === 0 ? (
              <div className="text-center py-8 opacity-60 bg-black/5 dark:bg-white/5 rounded-lg text-sm p-4">
                You have no active colleagues. Use the Network page to connect first!
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {friendsList.map(friend => (
                  <div key={friend.connection_id} className={`flex justify-between items-center p-3 rounded-xl border ${darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                    <div className="font-bold text-[15px]">{friend.colleague?.title} {friend.colleague?.full_name}</div>
                    <button
                      onClick={() => confirmShare(friend.colleague.id, sharingItem)}
                      disabled={shareBusyId === friend.colleague.id}
                      className="bg-[#71CFC2] text-[#062F63] px-3 py-2 rounded-lg font-bold text-sm flex gap-2 items-center hover:opacity-90 transition"
                    >
                      {shareBusyId === friend.colleague.id ? <Loader2 size={16} className="animate-spin"/> : "Send"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <h1 className={`text-3xl font-black mb-5 ${darkMode ? "text-white" : "text-[#113247]"}`}>History</h1>

      <div className={`${darkMode?"bg-white/10 border-white/10":"bg-white/90 border-[#DCEDEA]"} border rounded-lg p-3 mb-5 flex gap-2`}>
        <Search size={18} className={darkMode ? "text-slate-400" : "text-slate-500"}/>
        <input
          placeholder="Search..."
          className={`w-full outline-none bg-transparent ${darkMode ? "text-white placeholder:text-slate-400" : "text-[#113247]"}`}
          value={search}
          onChange={(e)=>setSearch(e.target.value)}
        />
        <button onClick={()=>exportCPD(filtered)} className={darkMode ? "text-slate-300" : "text-[#0B3760]"}>
          <Download/>
        </button>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className={`${darkMode?"bg-white/10 border-white/10":"bg-white/90 border-[#DCEDEA]"} border rounded-lg flex flex-col items-center justify-center py-16 gap-4`}>
            <HeartbeatLoader size={64} />
            <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2]">Loading History...</p>
          </div>
        ) : (
          <>
            {filtered.length===0&&(
              <div className={`${darkMode?"bg-white/10 border-white/10 text-slate-300":"bg-white/90 border-[#DCEDEA] text-slate-500"} border rounded-lg p-5 text-sm`}>
                No saved readings yet. Start a reading, then use Finish to save it here.
              </div>
            )}

            {filtered.map(item=>(
              <div key={item.id} className={`${darkMode?"bg-white/10 border-white/10":"bg-white/90 border-[#DCEDEA]"} border rounded-lg p-5 shadow-[0_10px_24px_rgba(11,55,96,0.06)]`}>
                
                <div className="flex justify-between gap-3">
                  <div>
                    <div className={`font-black ${darkMode?"text-white":"text-[#113247]"}`}>{item.title}</div>
                    <div className={`text-sm ${darkMode?"text-slate-300":"text-slate-500"}`}>{item.category}</div>
                  </div>
                  <div className={`flex gap-2 text-sm font-bold shrink-0 ${darkMode?"text-[#71CFC2]":"text-[#0B3760]"}`}>
                    <Clock3 size={16}/>
                    {item.duration_minutes}m
                  </div>
                </div>

                {item.article_url&&(
                  <a href={item.article_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#0F8F83] bg-[#E8F8F5] rounded-lg px-3 py-2 break-all">
                    <ExternalLink size={15}/> {item.article_url}
                  </a>
                )}

                <textarea
                  rows="5"
                  className={`${darkMode?"bg-white/10 text-white placeholder:text-slate-400 border-transparent focus:border-[#71CFC2]":"bg-[#F0F6F5] focus:border-[#71CFC2] border-transparent"} w-full rounded-lg p-4 mt-4 outline-none border transition`}
                  value={item.user_reflection||""}
                  onChange={(e)=>updateLocal(item.id,e.target.value)}
                />

                <div className="flex justify-end gap-3 mt-3 flex-wrap">
                  {aiEnabled && (
                    <button className={`${darkMode?"bg-white/10 text-[#71CFC2] hover:bg-white/20":"bg-[#E8F8F5] text-[#0B3760] hover:bg-[#d4f1ec]"} rounded-lg p-3 transition`} onClick={()=>generateAIReflection(item)} title="Generate AI Reflection">
                      <Sparkles size={18} />
                    </button>
                  )}

                  {/* Share Button Injected Here */}
                  <button className={`${darkMode?"bg-white/10 text-[#71CFC2] hover:bg-white/20":"bg-[#E8F8F5] text-[#0B3760] hover:bg-[#d4f1ec]"} rounded-lg p-3 transition`} onClick={()=>openShareMenu(item)} title="Share CPD">
                    <Share2 size={18} />
                  </button>

                  <button className={`${darkMode?"bg-white/10 text-[#71CFC2] hover:bg-white/20":"bg-[#E8F8F5] text-[#0B3760] hover:bg-[#d4f1ec]"} rounded-lg p-3 transition`} onClick={()=>saveReflection(item)} title="Save Reflection">
                    <Save size={18} />
                  </button>

                  <button className={`${darkMode?"bg-white/5 text-slate-400 hover:bg-red-500/20 hover:text-red-400":"bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-500"} rounded-lg p-3 transition`} onClick={()=>deleteEntry(item.id)} title="Delete Entry">
                    {loadingId===item.id ? <Loader2 size={18} className="animate-spin"/> : <Trash2 size={18} />}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}