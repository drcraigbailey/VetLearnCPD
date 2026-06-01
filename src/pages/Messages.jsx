import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, Send, User, MessageSquareX, Check, CheckCheck, Loader2, Edit, X, Share2, FileText, Stethoscope, BookOpen, Paperclip, Download } from "lucide-react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import { saveLocalFile } from "../utils/localFiles";

export default function Messages({ user, darkMode }) {
  const [conversations, setConversations] = useState([]);
  const [colleagues, setColleagues] = useState([]); 
  const [activeChat, setActiveChat] = useState(null);
  const [chatItems, setChatItems] = useState([]); 
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isNewChatMode, setIsNewChatMode] = useState(false); 
  const [isUploading, setIsUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  
  const [viewingRecord, setViewingRecord] = useState(null);
  const [viewingData, setViewingData] = useState(null);
  const [isViewingLoading, setIsViewingLoading] = useState(false);
  
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatItems]);

  useEffect(() => {
    if (!user) return;
    loadConversations();
    loadColleagues();

    const inboxSub = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadConversations();
      })
      .subscribe();

    return () => supabase.removeChannel(inboxSub);
  }, [user]);

  const loadColleagues = async () => {
    const { data } = await supabase
      .from('connections')
      .select(`
        id, requester_id, receiver_id,
        requester:profiles!connections_requester_id_fkey(id, full_name, title),
        receiver:profiles!connections_receiver_id_fkey(id, full_name, title)
      `)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (data) {
      const formatted = data.map(conn => {
        const isRequester = String(conn.requester_id) === String(user.id);
        return isRequester ? conn.receiver : conn.requester;
      }).filter(colleague => {
        if (!colleague) return false;
        if (String(colleague.id) === String(user.id)) return false;
        return true;
      });
      setColleagues(formatted);
    }
  };

  const loadConversations = async () => {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          id, updated_at,
          user1:profiles!conversations_user1_id_fkey(id, full_name, title),
          user2:profiles!conversations_user2_id_fkey(id, full_name, title),
          messages ( id, content, created_at, sender_id, is_read )
        `)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const formatted = data.map(c => {
        const colleague = c.user1.id === user.id ? c.user2 : c.user1;
        const lastMsg = c.messages?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        const unread = c.messages?.filter(m => m.sender_id !== user.id && !m.is_read).length || 0;
        return { ...c, colleague, lastMsg, unread };
      });

      setConversations(formatted);
    } catch (error) {
      toast.error("Failed to load inbox.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeChat) return;

    const loadChatHistory = async () => {
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeChat.id);
      
      const { data: records } = await supabase
        .from("shared_records")
        .select("*")
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${activeChat.colleague.id}),and(sender_id.eq.${activeChat.colleague.id},receiver_id.eq.${user.id})`);

      const formattedMsgs = (msgs || []).map(m => ({ ...m, timeline_type: 'message' }));
      const formattedRecords = (records || []).map(r => ({ ...r, timeline_type: 'record' }));

      const combined = [...formattedMsgs, ...formattedRecords].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      setChatItems(combined);
      markAsRead(activeChat.id, activeChat.colleague.id);
    };

    loadChatHistory();

    const chatSub = supabase
      .channel(`chat-${activeChat.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeChat.id}` 
      }, (payload) => {
        setChatItems(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, { ...payload.new, timeline_type: 'message' }];
        });
        if (payload.new.sender_id !== user.id) markAsRead(activeChat.id, activeChat.colleague.id);
      })
      .on('postgres_changes', { 
        event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeChat.id}` 
      }, (payload) => {
        setChatItems(prev => prev.map(m => (m.id === payload.new.id && m.timeline_type === 'message') ? { ...payload.new, timeline_type: 'message' } : m));
      })
      .subscribe();

    return () => supabase.removeChannel(chatSub);
  }, [activeChat, user.id]);

  const markAsRead = async (convId, colleagueId) => {
    // 1. Mark standard messages as read
    await supabase.from("messages").update({ is_read: true }).eq("conversation_id", convId).neq("sender_id", user.id).eq("is_read", false);
    
    // 2. Mark shared records as read
    if (colleagueId) {
      await supabase.from("shared_records").update({ status: 'read' }).eq("sender_id", colleagueId).eq("receiver_id", user.id).eq("status", "unread");
    }

    // 3. Update Local UI immediately so you don't need to refresh
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread: 0 } : c));
    setChatItems(prev => prev.map(item => {
      if (item.sender_id !== user.id) {
         return { ...item, is_read: true, status: item.status === 'unread' ? 'read' : item.status };
      }
      return item;
    }));

    // 4. Dispatch global event so external notification badges (in header/sidebar) clear instantly
    window.dispatchEvent(new Event('notificationsUpdated'));
  };

  const handleStartNewChat = async (colleague) => {
    try {
      if (!colleague || !colleague.id) return;
      
      let conv = conversations.find(c => c.colleague?.id === colleague.id);
      
      if (!conv) {
        toast.loading("Starting chat...", { id: "chat_setup" });
        
        const { data: existingChats, error: fetchErr } = await supabase
          .from('conversations')
          .select(`
            id, updated_at,
            user1:profiles!conversations_user1_id_fkey(id, full_name, title),
            user2:profiles!conversations_user2_id_fkey(id, full_name, title)
          `)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);
          
        if (!fetchErr && existingChats) {
          const dbConv = existingChats.find(c => c.user1?.id === colleague.id || c.user2?.id === colleague.id);
          if (dbConv) {
             const formattedColleague = dbConv.user1.id === user.id ? dbConv.user2 : dbConv.user1;
             conv = { ...dbConv, colleague: formattedColleague, lastMsg: null, unread: 0 };
          }
        }

        if (!conv) {
          const { data: newConvData, error: insertError } = await supabase
            .from('conversations')
            .insert({ user1_id: user.id, user2_id: colleague.id })
            .select()
            .single();
            
          if (insertError) {
            toast.error("Could not create chat: " + insertError.message, { id: "chat_setup" });
            return;
          }
          
          conv = { ...newConvData, colleague, lastMsg: null, unread: 0 };
          setConversations(prev => [conv, ...prev]);
        }
        toast.success("Chat ready!", { id: "chat_setup" });
      }
      
      setActiveChat(conv);
      setIsNewChatMode(false);
      setSearchQuery("");
      
    } catch (err) {
      toast.error("Something went wrong.", { id: "chat_setup" });
    }
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    const content = newMessage.trim();
    setNewMessage(""); 

    const tempId = `temp_${Date.now()}`;
    const tempMsg = {
      id: tempId,
      conversation_id: activeChat.id,
      sender_id: user.id,
      content: content,
      created_at: new Date().toISOString(),
      is_read: false,
      timeline_type: 'message'
    };
    
    setChatItems(prev => [...prev, tempMsg]);

    const { data, error } = await supabase.from("messages").insert({
      conversation_id: activeChat.id,
      sender_id: user.id,
      content: content
    }).select().single();

    if (error) {
      toast.error("Message failed to send");
      setChatItems(prev => prev.filter(m => m.id !== tempId)); 
      setNewMessage(content); 
    } else {
      setChatItems(prev => prev.map(m => m.id === tempId ? { ...data, timeline_type: 'message' } : m));
      chatInputRef.current?.focus();
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;

    setIsUploading(true);
    toast.loading("Uploading file...", { id: "file_upload" });

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${activeChat.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat_attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat_attachments')
        .getPublicUrl(filePath);

      const content = `📁 Shared File: ${file.name}\n${publicUrl}`;
      
      const tempId = `temp_file_${Date.now()}`;
      setChatItems(prev => [...prev, {
        id: tempId,
        conversation_id: activeChat.id,
        sender_id: user.id,
        content: content,
        created_at: new Date().toISOString(),
        is_read: false,
        timeline_type: 'message'
      }]);

      const { data, error: insertError } = await supabase.from("messages").insert({
        conversation_id: activeChat.id,
        sender_id: user.id,
        content: content
      }).select().single();

      if (insertError) {
        setChatItems(prev => prev.filter(m => m.id !== tempId));
        throw insertError;
      }

      setChatItems(prev => prev.map(m => m.id === tempId ? { ...data, timeline_type: 'message' } : m));
      toast.success("File sent", { id: "file_upload" });

    } catch (err) {
      toast.error("Failed to upload file. Check storage permissions.", { id: "file_upload" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openViewModal = async (msg) => {
    setViewingRecord(msg);
    setIsViewingLoading(true);
    setViewingData(null);
    try {
      const [realId, relayFolder] = msg.record_id.split(':::');
      let tableName = '';
      if (msg.record_type === 'cpd_read') tableName = 'cpd_reading';
      if (msg.record_type === 'protocol') tableName = 'protocols';
      if (msg.record_type === 'caselog') tableName = 'caselogs';

      const { data, error } = await supabase.from(tableName).select('*').eq('id', realId).single();
      if (error || !data) throw new Error("Record no longer exists.");

      if (relayFolder === 'nomedia' && data.media_urls) {
        data.media_urls = [];
      } else if (relayFolder && relayFolder !== 'nomedia') {
        data.has_relay_media = true;
      }

      setViewingData(data);
    } catch (err) {
      toast.error(err.message);
      setViewingRecord(null);
    } finally {
      setIsViewingLoading(false);
    }
  };

  const handleSaveRecord = async (msg, preFetchedData = null) => {
    setBusyId(msg.id);
    const [realId, relayFolder] = msg.record_id.split(':::');

    try {
      let tableName = '';
      if (msg.record_type === 'cpd_read') tableName = 'cpd_reading';
      if (msg.record_type === 'protocol') tableName = 'protocols';
      if (msg.record_type === 'caselog') tableName = 'caselogs';

      let copyData = preFetchedData;

      if (!copyData) {
        const { data, error: fetchErr } = await supabase.from(tableName).select('*').eq('id', realId).single();
        if (fetchErr || !data) throw new Error("Original record no longer exists.");
        copyData = data;
      }

      if (relayFolder && relayFolder !== 'nomedia') {
        toast.loading("Downloading media from relay...", { id: "save_record" });
        const { data: files } = await supabase.storage.from('relay').list(relayFolder);
        
        let newMediaUrls = [];
        if (files && files.length > 0) {
          for (const file of files) {
            if (file.name === '.emptyFolderPlaceholder') continue; 
            
            const { data: blob } = await supabase.storage.from('relay').download(`${relayFolder}/${file.name}`);
            if (blob) {
              const newLocalId = `local_${Date.now()}_${Math.random().toString(36).substring(2)}_${file.name}`;
              await saveLocalFile(newLocalId, blob);
              newMediaUrls.push(newLocalId);
            }
          }
        }
        copyData.media_urls = newMediaUrls;
      } else {
        if (copyData.media_urls) copyData.media_urls = [];
      }
      
      delete copyData.has_relay_media;
      const { id, user_id, created_at, ...insertData } = copyData;
      insertData.user_id = user.id;

      const { error: insertErr } = await supabase.from(tableName).insert(insertData);
      if (insertErr) throw insertErr;

      await supabase.from('shared_records').update({ status: 'saved' }).eq('id', msg.id);
      setChatItems(prev => prev.map(i => i.id === msg.id ? { ...i, status: 'saved' } : i));
      
      toast.success(`Saved to your ${msg.record_type.replace('_', ' ')}s!`, { id: "save_record" });
      setViewingRecord(null);

    } catch (err) {
      toast.error("Failed to save: " + err.message, { id: "save_record" });
    } finally {
      setBusyId(null);
    }
  };

  const getRecordIcon = (type) => {
    if (type === 'caselog') return <Stethoscope size={14} className="mr-1"/>;
    if (type === 'protocol') return <FileText size={14} className="mr-1"/>;
    if (type === 'cpd_read') return <BookOpen size={14} className="mr-1"/>;
    return <Share2 size={14} className="mr-1"/>;
  };

  const renderMessageContent = (content) => {
    if (content.startsWith('📁 Shared File:')) {
      const lines = content.split('\n');
      const fileName = lines[0].replace('📁 Shared File: ', '');
      const url = lines.slice(1).join('\n');
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-1 hover:opacity-80 transition-opacity">
          <div className="bg-black/10 dark:bg-white/20 p-2 rounded-lg">
            <Download size={20} />
          </div>
          <span className="underline font-bold truncate max-w-[150px] sm:max-w-[200px]">{fileName}</span>
        </a>
      );
    }
    return content;
  };

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;
    return conversations.filter(c => c.colleague?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [conversations, searchQuery]);

  const filteredColleagues = useMemo(() => {
    if (!searchQuery) return colleagues;
    return colleagues.filter(c => c?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [colleagues, searchQuery]);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg shadow-[0_14px_35px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg shadow-[0_14px_35px_rgba(11,55,96,0.07)] flex flex-col overflow-hidden";
    
  const textPrimary = darkMode ? "text-white" : "text-[#113247]";

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#71CFC2]" size={32} /></div>;

  return (
    <div className="h-[calc(100vh-140px)] w-full max-w-4xl mx-auto relative flex flex-col">
      
      {/* --- MODAL: View and Save Shared Record --- */}
      {viewingRecord && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className={`w-full max-w-lg rounded-2xl p-6 shadow-2xl flex flex-col relative max-h-[90vh] ${darkMode ? "bg-[#0B242B] text-white" : "bg-[#F9FCFB] text-[#113247]"}`}>
            <button onClick={() => setViewingRecord(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-500/20 transition"><X size={20} /></button>
            
            <div className="flex items-center gap-2 mb-1">
              {getRecordIcon(viewingRecord.record_type)}
              <h2 className="text-xs font-bold uppercase tracking-widest opacity-60">Shared {(viewingRecord.record_type || '').replace('_', ' ')}</h2>
            </div>
            <h2 className="text-2xl font-black mb-1">{viewingRecord.record_title}</h2>

            <div className="flex-1 overflow-y-auto mt-4 mb-2 pr-2 space-y-4">
              {isViewingLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#71CFC2]" size={24}/></div>
              ) : viewingData ? (
                <>
                  {viewingRecord.record_type === 'caselog' && (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-sm bg-black/5 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10">
                        <div><span className="opacity-50 text-xs block">Patient</span> <span className="font-bold">{viewingData.patient_name || 'N/A'}</span></div>
                        <div><span className="opacity-50 text-xs block">Species</span> <span className="font-bold">{viewingData.species || 'N/A'}</span></div>
                        <div><span className="opacity-50 text-xs block">Breed</span> <span className="font-bold">{viewingData.breed || 'N/A'}</span></div>
                        <div><span className="opacity-50 text-xs block">Age</span> <span className="font-bold">{viewingData.age || 'N/A'}</span></div>
                      </div>
                      <div>
                        <span className="font-black text-sm uppercase tracking-widest opacity-60">Description</span>
                        <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">{viewingData.description || 'No description provided.'}</p>
                      </div>
                    </>
                  )}
                  {viewingRecord.record_type === 'cpd_read' && (
                    <>
                      <div className="bg-black/5 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10">
                        <span className="font-black text-sm uppercase tracking-widest opacity-60">Category</span>
                        <p className="font-bold">{viewingData.category}</p>
                      </div>
                      <div>
                        <span className="font-black text-sm uppercase tracking-widest opacity-60">Notes / Reflection</span>
                        <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">{viewingData.reflection || viewingData.notes || 'No notes provided.'}</p>
                      </div>
                    </>
                  )}
                  {viewingRecord.record_type === 'protocol' && (
                    <div className="bg-black/5 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10">
                      <span className="font-black text-sm uppercase tracking-widest opacity-60">Details</span>
                      <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">{viewingData.description || 'No additional details.'}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-4 text-red-500 text-sm">Failed to load record details.</div>
              )}
            </div>

            {/* Save to Profile Footer */}
            <div className="flex gap-3 mt-auto pt-4 border-t border-slate-200 dark:border-white/10">
              <button onClick={() => setViewingRecord(null)} className={`flex-1 p-3 rounded-lg font-bold transition ${darkMode ? "bg-white/10 hover:bg-white/20" : "bg-slate-100 hover:bg-slate-200"}`}>Close</button>
              <button 
                onClick={() => handleSaveRecord(viewingRecord, viewingData)}
                disabled={busyId === viewingRecord.id || viewingRecord.status === 'saved' || !viewingData}
                className="flex-[2] bg-[#71CFC2] text-[#062F63] rounded-lg p-3 font-bold flex justify-center items-center gap-2 hover:opacity-90 disabled:opacity-50 transition"
              >
                {busyId === viewingRecord.id ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>}
                {viewingRecord.status === 'saved' ? 'Saved' : 'Save to Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------- */}
      {/* VIEW 1: INBOX / COLleague LIST*/}
      {/* ----------------------------- */}
      {!activeChat && (
        <div className={`w-full h-full ${panelClass}`}>
          <div className="p-6 border-b border-inherit">
            <div className="flex justify-between items-center mb-5">
              <h2 className={`text-2xl font-black ${textPrimary}`}>
                {isNewChatMode ? "Select Colleague" : "Messages"}
              </h2>
              <button 
                onClick={() => { setIsNewChatMode(!isNewChatMode); setSearchQuery(""); }} 
                className={`p-3 rounded-full transition-colors ${isNewChatMode ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-[#E8F8F5] text-[#0F8F83] hover:bg-[#71CFC2] hover:text-white'}`}
                title={isNewChatMode ? "Cancel" : "New Message"}
              >
                {isNewChatMode ? <X size={20} /> : <Edit size={20} />}
              </button>
            </div>
            <div className={`flex items-center px-4 py-3 rounded-xl border ${darkMode ? "bg-black/20 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <Search size={18} className="opacity-50 mr-3 shrink-0" />
              <input 
                type="text" 
                placeholder={isNewChatMode ? "Search network..." : "Search conversations..."} 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-base w-full"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isNewChatMode ? (
              filteredColleagues.length === 0 ? (
                <div className="p-8 text-center opacity-50 text-sm">No colleagues found in your network.</div>
              ) : (
                filteredColleagues.map(colleague => (
                  <button 
                    key={colleague.id} 
                    onClick={() => handleStartNewChat(colleague)}
                    className={`w-full text-left p-5 border-b border-inherit transition-colors flex items-center gap-4 hover:bg-black/5 dark:hover:bg-white/5`}
                  >
                    <div className="h-12 w-12 rounded-full bg-[#E8F8F5] text-[#0F8F83] flex items-center justify-center shrink-0 font-bold text-lg">
                      {colleague?.full_name?.charAt(0) || <User size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`font-bold text-lg block ${textPrimary}`}>{colleague?.full_name}</span>
                      <span className="text-sm opacity-60 block">{colleague?.title || "Veterinary Professional"}</span>
                    </div>
                  </button>
                ))
              )
            ) : (
              filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center opacity-50">
                  <MessageSquareX size={48} className="mb-4 opacity-50" />
                  <p className="font-medium text-lg mb-2">No conversations yet.</p>
                  <p className="text-sm">Click the edit icon above to start a new chat with a colleague.</p>
                </div>
              ) : (
                filteredConversations.map(chat => (
                  <button 
                    key={chat.id} 
                    onClick={() => setActiveChat(chat)}
                    className={`w-full text-left p-5 border-b border-inherit transition-colors flex items-center gap-4 hover:bg-black/5 dark:hover:bg-white/5`}
                  >
                    <div className="h-12 w-12 rounded-full bg-[#71CFC2] text-[#0B3760] flex items-center justify-center shrink-0 font-bold text-lg">
                      {chat.colleague?.full_name?.charAt(0) || <User size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className={`font-bold text-lg truncate ${textPrimary}`}>{chat.colleague?.full_name}</span>
                        {chat.lastMsg && <span className="text-xs font-medium opacity-50 whitespace-nowrap ml-2">{new Date(chat.lastMsg.created_at).toLocaleDateString()}</span>}
                      </div>
                      <div className="text-sm opacity-70 truncate">
                        {chat.lastMsg?.sender_id === user.id && "You: "}
                        {chat.lastMsg?.content?.startsWith('📁 Shared File:') ? 'Sent an attachment' : chat.lastMsg?.content || "No messages yet"}
                      </div>
                    </div>
                    {chat.unread > 0 && (
                      <div className="h-6 w-6 rounded-full bg-[#0F8F83] text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-md">
                        {chat.unread}
                      </div>
                    )}
                  </button>
                ))
              )
            )}
          </div>
        </div>
      )}

      {/* ----------------------------- */}
      {/* VIEW 2: ACTIVE CHAT WINDOW  */}
      {/* ----------------------------- */}
      {activeChat && (
        <div className={`w-full h-full animate-in fade-in zoom-in-95 duration-200 ${panelClass}`}>
          
          <div className={`p-5 border-b flex justify-between items-center z-10 ${darkMode ? "border-white/10" : "border-slate-100"}`}>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setActiveChat(null)} 
                className="p-2 -ml-2 text-[#0F8F83] dark:text-[#71CFC2] hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
              >
                ←
              </button>
              <div className="h-11 w-11 rounded-full bg-[#E8F8F5] text-[#0F8F83] flex items-center justify-center font-black text-lg shadow-inner">
                {activeChat.colleague?.full_name?.charAt(0) || <User size={18} />}
              </div>
              <div>
                <h3 className={`font-black text-lg leading-tight ${textPrimary}`}>{activeChat.colleague?.full_name}</h3>
                <p className="text-xs font-bold opacity-50">VetLearn Messenger</p>
              </div>
            </div>
            
            <button onClick={() => setActiveChat(null)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition">
              <X size={20} className="opacity-50" />
            </button>
          </div>

          <div className={`flex-1 overflow-y-auto p-6 space-y-4 ${darkMode ? "bg-black/10" : "bg-slate-50/50"}`}>
            {chatItems.length === 0 && (
              <div className="text-center opacity-40 text-sm mt-10">This is the start of your conversation.</div>
            )}
            
            {chatItems.map(item => {
              const isMe = item.sender_id === user.id;
              
              if (item.timeline_type === 'record') {
                return (
                  <div key={`rec_${item.id}`} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <button 
                      onClick={() => openViewModal(item)}
                      className={`flex flex-col gap-1 p-4 rounded-2xl max-w-[85%] sm:max-w-[70%] border shadow-sm transition hover:opacity-80 text-left cursor-pointer ${isMe ? 'bg-[#F2FAF9] border-[#71CFC2]/40 rounded-br-sm items-end text-right' : darkMode ? 'bg-[#12323A] border-white/10 rounded-bl-sm items-start' : 'bg-white border-slate-200 rounded-bl-sm items-start'}`}
                    >
                      <div className={`flex items-center text-[10px] font-black uppercase tracking-widest opacity-60 mb-1 ${isMe ? 'text-[#0F8F83]' : ''}`}>
                         {getRecordIcon(item.record_type)} Shared {(item.record_type || '').replace('_', ' ')}
                      </div>
                      <div className={`font-bold text-sm ${textPrimary}`}>{item.record_title}</div>
                      <div className="text-[10px] opacity-40 mt-2">{new Date(item.created_at).toLocaleDateString()}</div>
                    </button>
                  </div>
                );
              }

              return (
                <div key={`msg_${item.id}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap shadow-sm ${isMe ? 'bg-[#71CFC2] text-[#0B3760] font-medium rounded-br-sm' : darkMode ? 'bg-white/10 text-white rounded-bl-sm' : 'bg-white border border-slate-100 text-[#113247] rounded-bl-sm'}`}>
                    {renderMessageContent(item.content)}
                  </div>
                  <div className="flex items-center gap-1 mt-1 px-1">
                    <span className="text-[10px] opacity-40">{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {isMe && <span className={item.is_read ? 'text-[#0F8F83]' : 'opacity-30'}>{item.is_read ? <CheckCheck size={14} /> : <Check size={14} />}</span>}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className={`p-4 bg-white dark:bg-[#0B242B] border-t ${darkMode ? "border-white/10" : "border-slate-100"}`}>
            <div className="flex gap-3 items-center">
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
              />
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={`p-3 rounded-full transition-colors flex shrink-0 items-center justify-center ${darkMode ? "text-white hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}
                title="Attach File"
              >
                {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
              </button>

              <textarea 
                ref={chatInputRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className={`flex-1 rounded-xl px-5 py-3 text-sm border focus:outline-none focus:ring-2 focus:ring-[#71CFC2]/50 resize-none max-h-12 overflow-hidden shadow-sm ${darkMode ? "bg-[#071A24] border-white/10 text-white" : "bg-white border-slate-200 text-[#113247]"}`}
                rows={1}
              />
              
              <button 
                onClick={handleSend} 
                disabled={!newMessage.trim()} 
                className="h-11 w-11 rounded-xl bg-[#A3E4D7] hover:bg-[#71CFC2] text-[#0B3760] flex items-center justify-center disabled:opacity-50 disabled:grayscale transition-all shrink-0 shadow-sm"
              >
                <Send size={18} className="ml-1" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}