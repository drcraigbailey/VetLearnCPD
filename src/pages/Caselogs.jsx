import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import {
  BriefcaseMedical, Loader2, Plus, Trash2, Image as ImageIcon,
  FileText, X, UploadCloud, Search, Printer, ChevronDown, ChevronUp, Edit3, Share2
} from "lucide-react";
import { exportCaseLogs } from "../utils/casePdfExport";
import { saveLocalFile, getLocalFileUrl, deleteLocalFile } from "../utils/localFiles";
import HeartbeatLoader from "../components/HeartbeatLoader";

export default function Caselogs({ user, darkMode = false }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLogs, setSelectedLogs] = useState([]);

  // Modal / Editor State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState([]); 
  
  // Viewer state
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewType, setPreviewType] = useState(null);
  const [isViewerLoading, setIsViewerLoading] = useState(false);

  // Network Sharing State
  const [sharingLog, setSharingLog] = useState(null);
  const [friendsList, setFriendsList] = useState([]);
  const [isSharingLoading, setIsSharingLoading] = useState(false);
  const [shareBusyId, setShareBusyId] = useState(null);
  const [includeMedia, setIncludeMedia] = useState(true);

  const initialForm = {
    title: "", category: "Medicine", patient_name: "", species: "",
    breed: "", age: "", gender: "", description: "", files: [], existingMedia: []
  };
  const [form, setForm] = useState(initialForm);

  const categories = ["Medicine", "Surgery", "Neurology", "Emergency", "Dermatology", "Cardiology", "Dentistry", "Imaging", "Other"];

  const fieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 transition text-sm ${
    darkMode ? "bg-[#071A24] text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247]"
  }`;

  useEffect(() => {
    loadCaselogs();
  }, [user]);

  const loadCaselogs = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("caselogs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) toast.error(error.message);
    else setLogs(data || []);
    setLoading(false);
  };

  const updateForm = (field, value) => setForm({ ...form, [field]: value });

  const handleFileChange = (e) => {
    if (e.target.files) {
      setForm({ ...form, files: [...form.files, ...Array.from(e.target.files)] });
    }
  };

  const removeNewFile = (index) => {
    const newFiles = [...form.files];
    newFiles.splice(index, 1);
    setForm({ ...form, files: newFiles });
  };

  const removeExistingFile = (index) => {
    const updatedMedia = [...form.existingMedia];
    const removedId = updatedMedia.splice(index, 1)[0];
    setForm({ ...form, existingMedia: updatedMedia });
    setMediaToDelete(prev => [...prev, removedId]); 
  };

  const openEditor = (log = null) => {
    if (log) {
      setEditingId(log.id);
      setForm({
        title: log.title || "",
        category: log.category || "Medicine",
        patient_name: log.patient_name || "",
        species: log.species || "",
        breed: log.breed || "",
        age: log.age || "",
        gender: log.gender || "",
        description: log.description || "",
        existingMedia: log.media_urls || [],
        files: []
      });
      setShowAdvanced(!!(log.patient_name || log.breed || log.age || log.gender));
    } else {
      setEditingId(null);
      setForm(initialForm);
      setShowAdvanced(false);
    }
    setMediaToDelete([]);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setForm(initialForm);
    setMediaToDelete([]);
  };

  const processLocalMedia = async (files) => {
    const urls = [];
    for (const file of files) {
      const fileExt = file.name.split(".").pop();
      const fileId = `local_${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      try {
        await saveLocalFile(fileId, file);
        urls.push(fileId);
      } catch (err) {
        toast.error(`Failed to save ${file.name} to local device`);
      }
    }
    return urls;
  };

  const saveLog = async () => {
    if (!form.title.trim()) {
      toast.error("Add a case title first");
      return;
    }

    setSaving(true);
    toast.loading(editingId ? "Updating case..." : "Saving case...", { id: "caselog" });

    try {
      const newMediaUrls = await processLocalMedia(form.files);
      const finalMediaUrls = [...form.existingMedia, ...newMediaUrls];

      const payload = {
        user_id: user.id,
        title: form.title.trim(),
        category: form.category,
        patient_name: form.patient_name.trim() || null,
        species: form.species.trim() || null,
        breed: form.breed.trim() || null,
        age: form.age.trim() || null,
        gender: form.gender.trim() || null,
        description: form.description.trim() || null,
        media_urls: finalMediaUrls
      };

      if (editingId) {
        const { error } = await supabase.from("caselogs").update(payload).eq("id", editingId).eq("user_id", user.id);
        if (error) throw error;
        
        for (const urlId of mediaToDelete) {
          if (!urlId.startsWith("http")) await deleteLocalFile(urlId);
        }
      } else {
        const { error } = await supabase.from("caselogs").insert(payload);
        if (error) throw error;
      }

      toast.success("Case saved successfully!", { id: "caselog" });
      closeEditor();
      loadCaselogs();
    } catch (error) {
      toast.error(error.message, { id: "caselog" });
    } finally {
      setSaving(false);
    }
  };

  const deleteLog = async (log) => {
    setBusyId(log.id);
    const { error } = await supabase.from("caselogs").delete().eq("id", log.id).eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
    } else {
      if (log.media_urls) {
        for (const urlId of log.media_urls) {
          if (!urlId.startsWith("http")) await deleteLocalFile(urlId);
        }
      }
      setLogs(logs.filter(l => l.id !== log.id));
      setSelectedLogs(selectedLogs.filter(selId => selId !== log.id));
      toast.success("Case removed");
    }
    setBusyId(null);
  };

  // --- Network Sharing Logic ---
  const openShareMenu = async (log) => {
    setSharingLog(log);
    setIncludeMedia(true);
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

  const confirmShare = async (friendId, log) => {
    setShareBusyId(friendId);
    try {
      let finalId = String(log.id);

      if (includeMedia && log.media_urls && log.media_urls.length > 0) {
        toast.loading("Encrypting and uploading media to relay...", { id: "share" });
        const relayFolder = `relay_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        
        for (const urlId of log.media_urls) {
          if (urlId.startsWith("http")) continue; 
          const blobUrl = await getLocalFileUrl(urlId);
          if (!blobUrl) continue;
          
          const response = await fetch(blobUrl);
          const blob = await response.blob();
          
          // Push securely to the temporary cloud relay
          await supabase.storage.from('relay').upload(`${relayFolder}/${urlId}`, blob);
        }
        finalId = `${log.id}:::${relayFolder}`;
      } else {
        finalId = `${log.id}:::nomedia`;
      }

      const { error } = await supabase.from('shared_records').insert({
        sender_id: user.id, receiver_id: friendId, record_type: 'caselog', record_id: finalId, record_title: log.title
      });
      if (error) throw error;
      
      toast.success(`Case shared successfully!`, { id: "share" });
      setSharingLog(null);
    } catch (err) {
      toast.error("Failed to share case.", { id: "share" });
    } finally {
      setShareBusyId(null);
    }
  };

  const openViewer = async (urlId) => {
    const isPdf = urlId.toLowerCase().includes(".pdf");
    setPreviewType(isPdf ? "pdf" : "image");

    if (urlId.startsWith("http")) {
      setPreviewUrl(urlId);
    } else {
      setIsViewerLoading(true);
      const blobUrl = await getLocalFileUrl(urlId);
      setIsViewerLoading(false);

      if (!blobUrl) {
        toast.error("File not found on this device.");
        return;
      }
      setPreviewUrl(blobUrl);
    }
  };

  const closeViewer = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewType(null);
  };

  const toggleSelect = (id) => {
    setSelectedLogs(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handlePrintPDF = () => {
    const casesToExport = logs.filter(l => selectedLogs.includes(l.id));
    if (casesToExport.length === 0) {
      toast.error("Select cases to print first");
      return;
    }
    exportCaseLogs(casesToExport);
  };

  const filteredLogs = logs.filter(log => {
    const q = searchQuery.toLowerCase();
    return (
      (log.title?.toLowerCase() || "").includes(q) ||
      (log.patient_name?.toLowerCase() || "").includes(q) ||
      (log.species?.toLowerCase() || "").includes(q) ||
      (log.description?.toLowerCase() || "").includes(q) ||
      (log.category?.toLowerCase() || "").includes(q) ||
      new Date(log.created_at).toLocaleDateString().includes(q)
    );
  });

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  return (
    <div>
      {/* Network Share Modal */}
      {sharingLog && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl flex flex-col relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]"}`}>
            <button onClick={() => setSharingLog(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-500/20 transition">
              <X size={20} />
            </button>
            <h2 className="text-2xl font-black mb-1">Share Case</h2>
            <p className="text-sm opacity-70 mb-4">Select a colleague to securely share "{sharingLog.title}" with.</p>

            <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <input 
                type="checkbox" 
                id="shareMedia" 
                checked={includeMedia} 
                onChange={(e) => setIncludeMedia(e.target.checked)} 
                className="w-5 h-5 cursor-pointer accent-[#71CFC2]" 
              />
              <label htmlFor="shareMedia" className="text-sm font-bold cursor-pointer">
                Include uploaded photos & documents
              </label>
            </div>

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
                    <div>
                      <div className="font-bold text-[15px]">{friend.colleague?.title} {friend.colleague?.full_name}</div>
                    </div>
                    <button
                      onClick={() => confirmShare(friend.colleague.id, sharingLog)}
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

      {/* Media Viewer Modal */}
      {(previewUrl || isViewerLoading) && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
          <button onClick={closeViewer} className="absolute top-6 right-6 bg-white/20 text-white rounded-full p-2 hover:bg-white/30 z-[101]">
            <X size={24} />
          </button>
          
          {isViewerLoading ? (
            <div className="flex flex-col items-center justify-center text-white gap-4">
              <HeartbeatLoader size={80} />
              <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2]">Loading local file...</p>
            </div>
          ) : previewType === "pdf" ? (
            <iframe src={previewUrl} className="w-full h-[85vh] max-w-4xl bg-white rounded-lg" />
          ) : (
            <img src={previewUrl} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" alt="Preview" />
          )}
        </div>
      )}

      {/* Editor Full Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl flex flex-col ${darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]"}`}>
            <div className="flex justify-between items-center mb-5 border-b pb-4 border-slate-200 dark:border-white/10">
              <h2 className="text-2xl font-black">{editingId ? "Edit Case" : "New Case"}</h2>
              <button onClick={closeEditor} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 flex-grow">
              <div className="grid grid-cols-[2fr_1fr] gap-3">
                <input className={fieldClass} placeholder="Case Title (e.g. Diabetes M.)" value={form.title} onChange={(e) => updateForm("title", e.target.value)} />
                <select className={fieldClass} value={form.category} onChange={(e) => updateForm("category", e.target.value)}>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <button onClick={() => setShowAdvanced(!showAdvanced)} className={`flex items-center gap-2 text-sm font-bold w-full p-3 rounded-lg ${darkMode ? "bg-white/5 hover:bg-white/10" : "bg-slate-50 hover:bg-slate-100"}`}>
                {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showAdvanced ? "Hide Patient Details" : "Add Patient Details"}
              </button>

              {showAdvanced && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-black/5 dark:bg-white/5 animate-in slide-in-from-top-2">
                  <input className={fieldClass} placeholder="Patient Name" value={form.patient_name} onChange={(e) => updateForm("patient_name", e.target.value)} />
                  <input className={fieldClass} placeholder="Species (e.g. Canine)" value={form.species} onChange={(e) => updateForm("species", e.target.value)} />
                  <input className={fieldClass} placeholder="Breed" value={form.breed} onChange={(e) => updateForm("breed", e.target.value)} />
                  <div className="flex gap-2">
                    <input className={fieldClass} placeholder="Age" value={form.age} onChange={(e) => updateForm("age", e.target.value)} />
                    <input className={fieldClass} placeholder="M/F/MN/FN" value={form.gender} onChange={(e) => updateForm("gender", e.target.value)} />
                  </div>
                </div>
              )}

              <textarea rows="5" className={fieldClass} placeholder="Clinical presentation, treatment, and outcome..." value={form.description} onChange={(e) => updateForm("description", e.target.value)} />

              <div className="mt-4">
                <label className={`flex flex-col items-center justify-center gap-2 w-full p-6 border-2 border-dashed rounded-lg cursor-pointer transition ${darkMode ? "border-white/20 hover:border-[#71CFC2] text-slate-300" : "border-[#DCEDEA] hover:border-[#0F8F83] text-slate-500"}`}>
                  <UploadCloud size={24} />
                  <span className="font-bold text-sm">Upload Photos or PDFs (Local Only)</span>
                  <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
                </label>
              </div>

              {(form.existingMedia.length > 0 || form.files.length > 0) && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.existingMedia.map((url, i) => (
                    <div key={`exist-${i}`} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${darkMode ? "bg-[#71CFC2]/20 text-[#71CFC2]" : "bg-[#0F8F83]/10 text-[#0F8F83]"}`}>
                      <span className="truncate max-w-[120px]">Saved File {i+1}</span>
                      <button onClick={() => removeExistingFile(i)} className="hover:text-red-500"><X size={14} /></button>
                    </div>
                  ))}
                  {form.files.map((f, i) => (
                    <div key={`new-${i}`} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${darkMode ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"}`}>
                      <span className="truncate max-w-[120px]">{f.name}</span>
                      <button onClick={() => removeNewFile(i)} className="hover:text-red-500"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10 flex gap-3">
              <button onClick={closeEditor} className={`flex-1 rounded-lg p-4 font-bold ${darkMode ? "bg-white/10 hover:bg-white/20 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>Cancel</button>
              <button onClick={saveLog} disabled={saving} className="flex-[2] bg-[#71CFC2] text-[#062F63] rounded-lg p-4 font-black shadow-[0_8px_16px_rgba(113,207,194,0.2)] disabled:opacity-50 flex justify-center items-center gap-2">
                {saving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : "Save Case"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`relative overflow-hidden bg-gradient-to-br border rounded-lg p-6 mb-4 shadow-[0_18px_45px_rgba(11,55,96,0.08)] ${darkMode ? "from-[#12323A] to-[#0B242B] border-white/10" : "from-white to-[#DFF7F3] border-[#CDEBE7]"}`}>
        <img src="/logo.png" alt="" aria-hidden="true" className="absolute -right-8 -bottom-12 w-44 h-44 object-contain opacity-[0.10] pointer-events-none" />
        <div className="relative">
          <h1 className={`text-3xl font-black leading-tight tracking-normal mb-2 ${darkMode ? "text-white" : "text-[#113247]"}`}>Caselogs</h1>
          <p className={`text-sm leading-6 max-w-[260px] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
            Track, search, and export detailed clinical case reports. Share with your network directly.
          </p>
        </div>
      </div>

      {/* Actions Toolbar */}
      <div className={`${panelClass} mb-6 !p-3 flex flex-wrap gap-2`}>
        <div className="flex-grow flex gap-2 items-center bg-transparent border-r pr-2 border-slate-200 dark:border-slate-700">
          <Search size={18} className={darkMode ? "text-slate-400" : "text-slate-500"}/>
          <input
            placeholder="Search keywords, names..."
            className={`w-full outline-none bg-transparent text-sm ${darkMode ? "text-white placeholder:text-slate-400" : "text-[#113247]"}`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button onClick={handlePrintPDF} className={`p-2 rounded-lg transition flex items-center gap-2 text-sm font-bold ${selectedLogs.length > 0 ? "bg-[#0F8F83] text-white" : "bg-transparent text-slate-400"}`}>
          <Printer size={18} />
        </button>
        <button onClick={() => openEditor()} className="bg-[#71CFC2] text-[#062F63] p-2 rounded-lg font-bold flex items-center gap-1 shadow-sm">
          <Plus size={18} />
        </button>
      </div>

      {/* Case List */}
      <div className="space-y-4">
        {loading && (
          <div className={`${panelClass} flex flex-col items-center justify-center py-16 gap-4`}>
            <HeartbeatLoader size={64} />
            <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2]">Loading Cases...</p>
          </div>
        )}
        
        {!loading && filteredLogs.length === 0 && <div className={`${panelClass} text-center py-8 text-slate-500`}>No cases found.</div>}

        {!loading && filteredLogs.map((log) => (
          <div key={log.id} className={`${panelClass} relative border-l-4 ${selectedLogs.includes(log.id) ? "border-l-[#71CFC2]" : "border-l-transparent"} transition-all`}>
            
            <div className="absolute top-5 left-3">
              <input type="checkbox" checked={selectedLogs.includes(log.id)} onChange={() => toggleSelect(log.id)} className="w-4 h-4 cursor-pointer accent-[#71CFC2]" />
            </div>

            <div className="pl-6">
              <div className="flex justify-between items-start gap-3 mb-2">
                <div className="cursor-pointer" onClick={() => openEditor(log)}>
                  <h3 className={`font-black text-lg ${darkMode ? "text-white" : "text-[#113247]"}`}>{log.title || "Untitled Case"}</h3>
                </div>
                <div className="flex gap-1 bg-black/5 dark:bg-white/5 rounded-lg p-1">
                  <button onClick={() => openShareMenu(log)} title="Share with Colleague" className={`p-2 rounded-md transition ${darkMode ? "text-slate-400 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-black"}`}>
                    <Share2 size={16} />
                  </button>
                  <button onClick={() => openEditor(log)} title="Edit Case" className={`p-2 rounded-md transition ${darkMode ? "text-slate-400 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-black"}`}>
                    <Edit3 size={16} />
                  </button>
                  <button onClick={() => deleteLog(log)} title="Delete Case" className={`p-2 rounded-md transition ${darkMode ? "text-slate-400 hover:bg-red-500/20 hover:text-red-400" : "text-slate-400 hover:bg-red-50 hover:text-red-500"}`}>
                    {busyId === log.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
              {log.description && (
                <p className={`text-sm mt-3 line-clamp-2 cursor-pointer ${darkMode ? "text-slate-400" : "text-slate-600"}`} onClick={() => openEditor(log)}>
                  {log.description}
                </p>
              )}
              {log.media_urls && log.media_urls.length > 0 && (
                <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-700/50 flex flex-wrap gap-2">
                  {log.media_urls.map((url, i) => {
                    const isPdf = url.toLowerCase().includes(".pdf");
                    return (
                      <button key={i} onClick={() => openViewer(url)} className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold transition ${darkMode ? "bg-white/5 text-[#71CFC2] hover:bg-white/10" : "bg-[#F0F6F5] text-[#0F8F83] hover:bg-[#E8F8F5]"}`}>
                        {isPdf ? <FileText size={12} /> : <ImageIcon size={12} />} View
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}