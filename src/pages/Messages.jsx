import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCheck, Edit, Loader2, MessageSquare, MessageSquareX, Search, Send, User, X, Paperclip, Download, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import PageBanner from "../components/PageBanner";
import { supabase } from "../supabaseClient";
import { sendMessagePushNotification } from "../utils/pushNotifications";

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
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deletingConversation, setDeletingConversation] = useState(false);

  // Local file storage state
  const [attachment, setAttachment] = useState(null);
  const [localFiles, setLocalFiles] = useState({});

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

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
        if (payload.new.sender_id !== user.id) toast.success("New message received");
        loadConversations();
        refreshBadges();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        loadConversations();
        refreshBadges();
      })
      .subscribe();

    return () => supabase.removeChannel(inboxSub);
  }, [user]);

  useEffect(() => {
    if (!activeChat || !user?.id) return;
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
        if (payload.new.sender_id !== user.id) {
          markAsRead(activeChat.id, [payload.new.id]);
        }
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
  }, [activeChat?.id, user?.id]);

  useEffect(() => {
    if (loading || !user?.id) return;

    const conversationId = searchParams.get("conversation");
    const colleagueId = searchParams.get("colleague");

    if (!conversationId && !colleagueId) return;

    // Handle deep link to specific conversation
    if (conversationId) {
      const existingConversation = conversations.find(c => String(c.id) === String(conversationId));
      if (existingConversation) {
        setActiveChat(existingConversation);
        setSearchParams({}, { replace: true });
        return;
      }
    }

    // Handle deep link to specific colleague
    if (colleagueId) {
      const existingConversation = conversations.find(conversation => String(conversation.colleague?.id) === String(colleagueId));
      if (existingConversation) {
        setActiveChat(existingConversation);
        setSearchParams({}, { replace: true });
        return;
      }

      const colleague = colleagues.find(item => String(item?.id) === String(colleagueId));
      if (colleague) {
        handleStartNewChat(colleague);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, setSearchParams, loading, user?.id, conversations, colleagues]);

  // Load locally stored files linked to current chat messages
  useEffect(() => {
    const files = {};
    chatItems.forEach(item => {
      const saved = localStorage.getItem(`vetlearn-file-${item.id}`);
      if (saved) {
        try {
          files[item.id] = JSON.parse(saved);
        } catch (e) {
          console.error("Could not parse local file for message", item.id);
        }
      }
    });
    setLocalFiles(files);
  }, [chatItems]);

  const refreshBadges = () => {
    window.dispatchEvent(new Event("messagesUpdated"));
    window.dispatchEvent(new Event("notificationsUpdated"));
  };

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

      const formatted = (data || []).map(conversation => formatConversation(conversation));
      setConversations(formatted);
    } catch (error) {
      toast.error("Failed to load inbox");
    } finally {
      setLoading(false);
    }
  };

  const formatConversation = (conversation) => {
    const colleague = String(conversation.user1_id) === String(user.id) ? conversation.user2 : conversation.user1;
    const sortedMessages = [...(conversation.messages || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const lastMsg = sortedMessages[0];
    const unread = sortedMessages.filter(message => String(message.sender_id) !== String(user.id) && !message.is_read).length;
    return { ...conversation, colleague, lastMsg, unread, messages: sortedMessages };
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
      const items = data || [];
      setChatItems(items);
      const unreadIncomingIds = items
        .filter(item => String(item.sender_id) !== String(user.id) && !item.is_read)
        .map(item => item.id);
      await markAsRead(chat.id, unreadIncomingIds);
    }
    setChatLoading(false);
  };

  const isMissingFunctionError = (error) => {
    return error?.code === "PGRST202" || error?.message?.toLowerCase().includes("function");
  };

  const directMarkMessagesRead = async (conversationId) => {
    const readAt = new Date().toISOString();
    const result = await supabase
      .from("messages")
      .update({ is_read: true, read_at: readAt })
      .eq("conversation_id", conversationId)
      .neq("sender_id", user.id)
      .eq("is_read", false);

    if (!result.error || !result.error.message?.includes("read_at")) return result;

    return supabase
      .from("messages")
      .update({ is_read: true })
      .eq("conversation_id", conversationId)
      .neq("sender_id", user.id)
      .eq("is_read", false);
  };

  const markRelatedNotificationsRead = async (messageIds) => {
    if (!messageIds.length) return;
    const readAt = new Date().toISOString();
    const result = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: readAt })
      .eq("user_id", user.id)
      .eq("type", "message")
      .in("related_id", messageIds.map(String));

    if (!result.error || !result.error.message?.includes("read_at")) return;

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("type", "message")
      .in("related_id", messageIds.map(String));
  };

  const applyReadStateLocally = (conversationId) => {
    setConversations(prev => prev.map(conversation => {
      if (conversation.id !== conversationId) return conversation;
      return {
        ...conversation,
        unread: 0,
        messages: (conversation.messages || []).map(message => String(message.sender_id) !== String(user.id) ? { ...message, is_read: true } : message)
      };
    }));
    setActiveChat(prev => prev?.id === conversationId ? { ...prev, unread: 0 } : prev);
    setChatItems(prev => prev.map(item => String(item.sender_id) !== String(user.id) ? { ...item, is_read: true } : item));
    refreshBadges();
  };

  const markAsRead = async (conversationId, unreadMessageIds = []) => {
    if (!conversationId) return;

    const idsToMark = unreadMessageIds.length
      ? unreadMessageIds
      : chatItems.filter(item => String(item.sender_id) !== String(user.id) && !item.is_read).map(item => item.id);

    if (!idsToMark.length) {
      applyReadStateLocally(conversationId);
      return;
    }

    let saveError = null;
    const rpcResult = await supabase.rpc("mark_conversation_messages_read", { conversation_uuid: conversationId });

    if (rpcResult.error && isMissingFunctionError(rpcResult.error)) {
      const directResult = await directMarkMessagesRead(conversationId);
      saveError = directResult.error;
    } else {
      saveError = rpcResult.error;
    }

    if (saveError) {
      toast.error("Read status could not be saved. Please run the latest Supabase SQL update.");
      return;
    }

    await markRelatedNotificationsRead(idsToMark);
    applyReadStateLocally(conversationId);
    if (activeTab === "unread") setActiveTab("read");
  };

  const deleteConversation = async (chat) => {
    if (!chat?.id || deletingConversation) return;

    setDeletingConversation(true);

    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", chat.id);

    if (messagesError) {
      toast.error("Could not delete messages");
      setDeletingConversation(false);
      return;
    }

    const { error: conversationError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", chat.id)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

    if (conversationError) {
      toast.error("Could not delete conversation");
      setDeletingConversation(false);
      return;
    }

    setConversations(prev => prev.filter(conversation => conversation.id !== chat.id));

    if (activeChat?.id === chat.id) {
      setActiveChat(null);
      setChatItems([]);
    }

    setDeleteCandidate(null);
    setDeletingConversation(false);
    refreshBadges();
    toast.success("Conversation deleted");
  };

  const handleOpenChat = (chat) => {
    setActiveChat(chat);
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

    sendMessagePushNotification({
      recipientId,
      title: "New VetLearn message",
      body: user?.user_metadata?.full_name 
        ? `New message from ${user.user_metadata.full_name}` 
        : "You have a new VetLearn message.",
      messageId: message.id,
      conversationId: activeChat.id
    });
  };

  const handleSend = async (event) => {
    if (event) event.preventDefault();
    if ((!newMessage.trim() && !attachment) || !activeChat || sending) return;

    const content = newMessage.trim() || (attachment ? "📎 [Local File Attached]" : "");
    const cachedMessage = newMessage;

    setNewMessage("");
    setSending(true);

    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: activeChat.id, sender_id: user.id, content, is_read: false })
      .select()
      .single();

    if (error) {
      toast.error("Message failed to send");
      setNewMessage(cachedMessage);
    } else {
      if (attachment) {
        if (attachment.size > 2 * 1024 * 1024) {
          toast.error("File exceeds 2MB local storage limit");
        } else {
          const reader = new FileReader();
          reader.onloadend = () => {
            const fileObj = { name: attachment.name, data: reader.result };
            try {
              localStorage.setItem(`vetlearn-file-${data.id}`, JSON.stringify(fileObj));
              setLocalFiles(prev => ({ ...prev, [data.id]: fileObj }));
            } catch (err) {
              toast.error("Browser storage is full. Could not save file locally.");
            }
          };
          reader.readAsDataURL(attachment);
        }
        setAttachment(null);
      }

      setChatItems(prev => prev.some(item => item.id === data.id) ? prev : [...prev, data]);
      setConversations(prev => prev.map(conversation => conversation.id === activeChat.id ? { ...conversation, lastMsg: data, messages: [data, ...(conversation.messages || [])] } : conversation));
      notifyRecipient(data);
      chatInputRef.current?.focus();
    }
    setSending(false);
  };

  const unreadConversations = useMemo(() => conversations.filter(conversation => conversation.unread > 0), [conversations]);
  const readConversations = useMemo(() => conversations.filter(conversation => conversation.unread === 0 && conversation.lastMsg), [conversations]);
  const unreadMessageCount = useMemo(() => conversations.reduce((total, conversation) => total + conversation.unread, 0), [conversations]);

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
          badges={[{ label: `${unreadMessageCount} unread`, icon: <MessageSquare size={13} />, accent: true }]}
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
                visibleConversations.map(chat => {
                  const isUnread = chat.unread > 0;
                  return (
                    <div
                      key={chat.id}
                      className="w-full p-5 border-b border-inherit transition-colors flex items-center gap-4 hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <button
                        onClick={() => handleOpenChat(chat)}
                        className="flex-1 min-w-0 text-left flex items-center gap-4"
                      >
                        <div className={`${isUnread ? "bg-[#71CFC2] text-[#0B3760]" : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"} h-12 w-12 rounded-full flex items-center justify-center shrink-0 font-bold text-lg`}>
                          {chat.colleague?.full_name?.charAt(0) || <User size={20} />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                            <span className={`${isUnread ? "font-black" : "font-bold opacity-80"} text-lg truncate ${textPrimary}`}>
                              {chat.colleague?.full_name}
                            </span>
                            {chat.lastMsg && (
                              <span className="text-xs font-medium opacity-50 whitespace-nowrap ml-2">
                                {new Date(chat.lastMsg.created_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <div className={`${isUnread ? "font-semibold opacity-90" : "opacity-60"} text-sm truncate`}>
                            {chat.lastMsg?.sender_id === user.id && "You: "}
                            {chat.lastMsg?.content || "No messages yet"}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 shrink-0">
                        {isUnread && (
                          <div className="h-6 min-w-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center px-2 shadow-md">
                            {chat.unread}
                          </div>
                        )}

                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteCandidate(chat);
                          }}
                          className={`h-9 w-9 rounded-full grid place-items-center transition ${
                            darkMode
                              ? "bg-red-500/15 text-red-200 hover:bg-red-500/25"
                              : "bg-red-50 text-red-600 hover:bg-red-100"
                          }`}
                          title="Delete conversation"
                          aria-label="Delete conversation"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
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
                const fileObj = localFiles[item.id];

                return (
                  <div key={item.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${isMe ? "bg-[#71CFC2] text-[#0B3760] font-medium rounded-br-sm" : darkMode ? "bg-white/10 text-white rounded-bl-sm" : "bg-white border border-slate-100 text-[#113247] rounded-bl-sm"}`}>
                      {item.content && <div className="whitespace-pre-wrap">{item.content}</div>}

                      {fileObj && (
                        <a href={fileObj.data} download={fileObj.name} className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition ${isMe ? "bg-black/10 hover:bg-black/20" : darkMode ? "bg-white/10 hover:bg-white/20" : "bg-black/5 hover:bg-black/10"}`}>
                          <Download size={14} /> Download {fileObj.name}
                        </a>
                      )}
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

            <form
              onSubmit={handleSend}
              className={`p-4 border-t ${
                darkMode
                  ? "bg-[#071A24] border-white/10"
                  : "bg-white border-slate-100"
              }`}
            >
              {attachment && (
                <div
                  className={`mb-3 px-4 py-3 rounded-lg flex justify-between items-center text-sm ${
                    darkMode
                      ? "bg-white/10 border border-white/10"
                      : "bg-[#F0F6F5] border border-[#DCEDEA]"
                  }`}
                >
                  <span className="truncate opacity-80 flex items-center gap-2 font-medium">
                    <Paperclip size={14} /> {attachment.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="text-red-400 hover:opacity-70 p-1"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              <div
                className={`flex gap-3 items-center rounded-lg p-3 border ${
                  darkMode
                    ? "bg-white/10 border-white/10"
                    : "bg-[#F0F6F5] border-[#DCEDEA]"
                }`}
              >
                <label
                  className={`cursor-pointer h-11 w-11 rounded-lg grid place-items-center shrink-0 transition ${
                    darkMode
                      ? "bg-[#071A24] text-slate-200 hover:bg-white/10"
                      : "bg-white text-[#0B3760] hover:bg-[#E8F8F5]"
                  }`}
                >
                  <Paperclip size={18} className="opacity-70" />
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => setAttachment(e.target.files[0])}
                  />
                </label>

                <textarea
                  ref={chatInputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className={`flex-1 rounded-lg px-4 py-3 text-sm border-none outline-none resize-none max-h-12 overflow-hidden ${
                    darkMode
                      ? "bg-[#071A24] text-white placeholder:text-slate-400"
                      : "bg-white text-[#113247] placeholder:text-slate-400"
                  }`}
                  rows={1}
                />

                <button
                  type="submit"
                  disabled={(!newMessage.trim() && !attachment) || sending}
                  className="h-11 w-11 rounded-lg bg-[#71CFC2] text-[#0B3760] flex items-center justify-center disabled:opacity-40 disabled:grayscale transition-all shrink-0"
                >
                  {sending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} className="ml-1" />
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {deleteCandidate && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 px-4 backdrop-blur-sm">
          <div
            className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${
              darkMode
                ? "bg-[#071A24] border-white/10 text-white"
                : "bg-white border-[#DCEDEA] text-[#113247]"
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl font-black">Delete conversation?</h3>
                <p className="mt-2 text-sm opacity-70 leading-6">
                  This will delete the conversation with{" "}
                  <span className="font-black">
                    {deleteCandidate.colleague?.full_name || "this colleague"}
                  </span>{" "}
                  and remove its messages.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                disabled={deletingConversation}
                className={`h-9 w-9 rounded-full grid place-items-center shrink-0 ${
                  darkMode
                    ? "bg-white/10 text-slate-200"
                    : "bg-[#E8F8F5] text-[#0B3760]"
                }`}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                disabled={deletingConversation}
                className={`flex-1 rounded-lg px-4 py-3 text-sm font-black ${
                  darkMode
                    ? "bg-white/10 text-slate-200"
                    : "bg-[#E8F8F5] text-[#0B3760]"
                }`}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => deleteConversation(deleteCandidate)}
                disabled={deletingConversation}
                className="flex-1 rounded-lg bg-red-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {deletingConversation ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}