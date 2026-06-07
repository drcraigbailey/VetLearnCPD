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
    const senderName = user?.user_metadata?.full_name || "a colleague";

    sendMessagePushNotification({
      recipientId,
      title: "New message",
      body: `From ${senderName}`,
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
    return colleagues.filter(colleague => colleague.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [colleagues, searchQuery]);

  // Rest of component remains unchanged
