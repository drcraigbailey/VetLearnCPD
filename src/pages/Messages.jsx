import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, Edit, Loader2, MessageSquare, MessageSquareX, Search, Send, User, X } from "lucide-react";
import toast from "react-hot-toast";
import PageBanner from "../components/PageBanner";
import { supabase } from "../supabaseClient";

export default function Messages({ user, darkMode }) {
  const [conversations, setConversations] = useState([]);
  const [colleagues, setColleagues] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [chatItems, setChatItems] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("unread");
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [isNewChatMode, setIsNewChatMode] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatItems]);

  useEffect(() => {
    if (!user) return;
    loadConversations();
    loadColleagues();

    const inboxSub = supabase
      .channel(`messages-inbox-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        if (payload.new.sender_id !== user.id) {
          toast.success("New message received");
        }
        loadConversations();
        window.dispatchEvent(new Event("messagesUpdated"));
        window.dispatchEvent(new Event("notificationsUpdated"));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        loadConversations();
        window.dispatchEvent(new Event("messagesUpdated"));
      })
      .subscribe();

    return () => supabase.removeChannel(inboxSub);
  }, [user]);

  useEffect(() => {
    if (!activeChat) return;
    loadChatHistory(activeChat);

    const chatSub = supabase
      .channel(`chat-${activeChat.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${activeChat.id}`
      }, (payload) => {
        setChatItems(prev => prev.some(item => item.id === payload.new.id) ? prev : [...prev, payload.new]);
        if (payload.new.sender_id !== user.id) markAsRead(activeChat.id);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${activeChat.id}`
      }, (payload) => {
        setChatItems(prev => prev.map(item => item.id === payload.new.id ? payload.new : item));
      })
      .subscribe();

    return () => supabase.removeChannel(chatSub);
  }, [activeChat, user.id]);

  const loadColleagues = async () => {
    const { data, error } = await supabase
      .from("connections")
      .select(`
        id, requester_id, receiver_id,
        requester:profiles!connections_requester_id_fkey(id, full_name, title),
        receiver:profiles!connections_receiver_id_fkey(id, full_name, title)
      `)
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (error) return;

    const formatted = (data || []).map(conn => {
      const isRequester = String(conn.requester_id) === String(user.id);
      return isRequester ? conn.receiver : conn.requester;
    }).filter(colleague => colleague && String(colleague.id) !== String(user.id));

    setColleagues(formatted);
  };

  const loadConversations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          id, updated_at, user1_id, user2_id,
          user1:profiles!conversations_user1_id_fkey(id, full_name, title),
          user2:profiles!conversations_user2_id_fkey(id, full_name, title),
          messages ( id, content, created_at, sender_id, is_read )
        `)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map(conversation => {
        const colleague = conversation.user1_id === user.id ? conversation.user2 : conversation.user1;
        const sortedMessages = [...(conversation.messages || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const lastMsg = sortedMessages[0];
        const unread = sortedMessages.filter(message => message.sender_id !== user.id && !message.is_read).length;
        return { ...conversation, colleague, lastMsg, unread };
      });

      setConversations(formatted);
    } catch (error) {
      toast.error("Failed to load inbox");
    } finally {
      setLoading(false);
    }
  };

  const loadChatHistory = async (chat) => {
    setChatLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", chat.id)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Failed to load conversation");
    } else {
      setChatItems(data || []);
      await markAsRead(chat.id);
    }
    setChatLoading(false);
  };

  const markAsRead = async (conversationId) => {
    const { error } = await supabase
      .from("messages")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .neq("sender_id", user.id)
      .eq("is_read", false);

    if (error) {
      toast.error("Could not update read status");
      return;
    }

    setConversations(prev => prev.map(conversation => conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation));
    setChatItems(prev => prev.map(item => item.sender_id !== user.id ? { ...item, is_read: true } : item));
    window.dispatchEvent(new Event("messagesUpdated"));
    window.dispatchEvent(new Event("notificationsUpdated"));
  };

  const handleStartNewChat = async (colleague) => {
    if (!colleague?.id) return;

    let conversation = conversations.find(item => item.colleague?.id === colleague.id);
    if (!conversation) {
      toast.loading("Starting chat...", { id: "chat_setup" });
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user1_id: user.id, user2_id: colleague.id })
        .select("id, updated_at, user1_id, user2_id")
        .single();

      if (error) {
        toast.error("Could not create chat", { id: "chat_setup" });
        return;
      }

      conversation = { ...data, colleague, lastMsg: null, unread: 0, messages: [] };
      setConversations(prev => [conversation, ...prev]);
      toast.success("Chat ready", { id: "chat_setup" });
    }

    setActiveChat(conversation);
    setIsNewChatMode(false);
    setSearchQuery("");
  };

  const notifyRecipient = async (message) => {
    const recipientId = activeChat.user1_id === user.id ? activeChat.user2_id : activeChat.user1_id;
    await supabase.from("notifications").insert({
      user_id: recipientId,
      type: "message",
      title: "New message",
      message: `${activeChat.colleague?.full_name || "A colleague"} sent you a message.`,
      is_read: false,
      related_id: String(message.id)
    });
  };

  const handleSend = async (event) => {
    if (event) event.preventDefault();
    if (!newMessage.trim() || !activeChat || sending) return;

    const content = newMessage.trim();
    setNewMessage("");
    setSending(true);

    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: activeChat.id, sender_id: user.id, content, is_read: false })
      .select()
      .single();

    if (error) {
      toast.error("Message failed to send");
      setNewMessage(content);
    } else {
      setChatItems(prev => prev.some(item => item.id === data.id) ? prev : [...prev, data]);
      setConversations(prev => prev.map(conversation => conversation.id === activeChat.id ? { ...conversation, lastMsg: data } : conversation));
      notifyRecipient(data);
      chatInputRef.current?.focus();
    }
    setSending(false);
  };

  const unreadConversations = useMemo(() => conversations.filter(conversation => conversation.unread > 0), [conversations]);
  const readConversations = useMemo(() => conversations.filter(conversation => conversation.unread === 0 && conversation.lastMsg), [conversations]);

  const visibleConversations = useMemo(() => {
    const source = activeTab === "unread" ? unreadConversations : readConversations;
    if (!searchQuery) return source;
    return source.filter(conversation => conversation.colleague?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [activeTab, readConversations, searchQuery, unreadConversations]);

  const filteredColleagues = useMemo(() => {
    if (!searchQuery) return colleagues;
    return colleagues.filter(colleague => colleague?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [colleagues, searchQuery]);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg shadow-[0_14px_35px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg shadow-[0_14px_35px_rgba(11,55,96,0.07)] flex flex-col overflow-hidden";
  const textPrimary = darkMode ? "text-white" : "text-[#113247]";

  const tabClass = (tab) => `px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition ${
    activeTab === tab
      ? "bg-[#71CFC2] text-[#062F63] shadow-md"
      : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"
  }`;

  return (
    <div className="pb-8">
      {!activeChat && (
        <PageBanner
          title="Messages"
          subtitle="Communicate securely with colleagues."
          darkMode={darkMode}
          badges={[{ label: `${unreadConversations.length} unread`, icon: <MessageSquare size={13} />, accent: true }]}
        />
      )}

      <div className="h-[calc(100vh-180px)] w-full max-w-4xl mx-auto relative flex flex-col">
        {!activeChat && (
          <div className={`w-full h-full ${panelClass}`}>
            <div className="p-5 border-b border-inherit">
              <div className="flex justify-between items-center mb-4">
                <h2 className={`text-2xl font-black ${textPrimary}`}>
                  {isNewChatMode ? "Select Colleague" : "Inbox"}
                </h2>
                <button
                  onClick={() => { setIsNewChatMode(!isNewChatMode); setSearchQuery(""); }}
                  className={`p-3 rounded-full transition-colors ${isNewChatMode ? "bg-slate-200 text-slate-600" : "bg-[#E8F8F5] text-[#0F8F83]"}`}
                  title={isNewChatMode ? "Cancel" : "New Message"}
                >
                  {isNewChatMode ? <X size={20} /> : <Edit size={20} />}
                </button>
              </div>

              {!isNewChatMode && (
                <div className="flex gap-2 mb-4">
                  <button className={tabClass("unread")} onClick={() => setActiveTab("unread")}>Unread</button>
                  <button className={tabClass("read")} onClick={() => setActiveTab("read")}>Read</button>
                </div>
              )}

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
                    <button key={colleague.id} onClick={() => handleStartNewChat(colleague)} className="w-full text-left p-5 border-b border-inherit transition-colors flex items-center gap-4 hover:bg-black/5 dark:hover:bg-white/5">
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
              ) : loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#71CFC2]" size={28} /></div>
              ) : visibleConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center opacity-50">
                  <MessageSquareX size={48} className="mb-4 opacity-50" />
                  <p className="font-medium text-lg mb-2">{activeTab === "unread" ? "No unread messages." : "No read conversations yet."}</p>
                  <p className="text-sm">Use the edit icon above to start a new chat with a colleague.</p>
                </div>
              ) : (
                visibleConversations.map(chat => (
                  <button key={chat.id} onClick={() => setActiveChat(chat)} className="w-full text-left p-5 border-b border-inherit transition-colors flex items-center gap-4 hover:bg-black/5 dark:hover:bg-white/5">
                    <div className="h-12 w-12 rounded-full bg-[#71CFC2] text-[#0B3760] flex items-center justify-center shrink-0 font-bold text-lg">
                      {chat.colleague?.full_name?.charAt(0) || <User size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className={`font-bold text-lg truncate ${textPrimary}`}>{chat.colleague?.full_name}</span>
                        {chat.lastMsg && <span className="text-xs font-medium opacity-50 whitespace-nowrap ml-2">{new Date(chat.lastMsg.created_at).toLocaleDateString()}</span>}
                      </div>
                      <div className="text-sm opacity-70 truncate">
                        {chat.lastMsg?.sender_id === user.id && "You: "}{chat.lastMsg?.content || "No messages yet"}
                      </div>
                    </div>
                    {chat.unread > 0 && <div className="h-6 min-w-6 rounded-full bg-[#0F8F83] text-white text-xs font-bold flex items-center justify-center shrink-0 px-2 shadow-md">{chat.unread}</div>}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {activeChat && (
          <div className={`w-full h-full animate-in fade-in zoom-in-95 duration-200 ${panelClass}`}>
            <div className={`p-5 border-b flex justify-between items-center z-10 ${darkMode ? "border-white/10" : "border-slate-100"}`}>
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveChat(null)} className="p-2 -ml-2 text-[#0F8F83] dark:text-[#71CFC2] hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors">←</button>
                <div className="h-11 w-11 rounded-full bg-[#E8F8F5] text-[#0F8F83] flex items-center justify-center font-black text-lg shadow-inner">
                  {activeChat.colleague?.full_name?.charAt(0) || <User size={18} />}
                </div>
                <div>
                  <h3 className={`font-black text-lg leading-tight ${textPrimary}`}>{activeChat.colleague?.full_name}</h3>
                  <p className="text-xs font-bold opacity-50">VetLearn Messenger</p>
                </div>
              </div>
              <button onClick={() => setActiveChat(null)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition"><X size={20} className="opacity-50" /></button>
            </div>

            <div className={`flex-1 overflow-y-auto p-6 space-y-4 ${darkMode ? "bg-black/10" : "bg-slate-50/50"}`}>
              {chatLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#71CFC2]" /></div> : chatItems.length === 0 && <div className="text-center opacity-40 text-sm mt-10">This is the start of your conversation.</div>}

              {chatItems.map(item => {
                const isMe = item.sender_id === user.id;
                return (
                  <div key={item.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap shadow-sm ${isMe ? "bg-[#71CFC2] text-[#0B3760] font-medium rounded-br-sm" : darkMode ? "bg-white/10 text-white rounded-bl-sm" : "bg-white border border-slate-100 text-[#113247] rounded-bl-sm"}`}>
                      {item.content}
                    </div>
                    <div className="flex items-center gap-1 mt-1 px-1">
                      <span className="text-[10px] opacity-40">{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {isMe && <span className={item.is_read ? "text-[#0F8F83]" : "opacity-30"}><CheckCheck size={14} /></span>}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className={`p-4 bg-white dark:bg-[#0B242B] border-t ${darkMode ? "border-white/10" : "border-slate-100"}`}>
              <div className="flex gap-3 items-center">
                <textarea
                  ref={chatInputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type a message..."
                  className={`flex-1 rounded-xl px-5 py-3 text-sm border focus:outline-none focus:ring-2 focus:ring-[#71CFC2]/50 resize-none max-h-12 overflow-hidden shadow-sm ${darkMode ? "bg-[#071A24] border-white/10 text-white" : "bg-white border-slate-200 text-[#113247]"}`}
                  rows={1}
                />
                <button type="submit" disabled={!newMessage.trim() || sending} className="h-11 w-11 rounded-xl bg-[#A3E4D7] hover:bg-[#71CFC2] text-[#0B3760] flex items-center justify-center disabled:opacity-50 disabled:grayscale transition-all shrink-0 shadow-sm">
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-1" />}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
