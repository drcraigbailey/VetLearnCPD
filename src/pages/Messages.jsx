import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Edit,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  MessageSquareX,
  Paperclip,
  Search,
  Send,
  Trash2,
  User,
  Users,
  X
} from "lucide-react";
import toast from "react-hot-toast";
import AppPopup, { popupPresets } from "../components/AppPopup";
import PageBanner from "../components/PageBanner";
import { IconButton } from "../components/VetLearnUI";
import { supabase } from "../supabaseClient";
import { openPdfViewer } from "../utils/pdfViewerBridge";
import { sendAdminSupportPushNotification, sendMessagePushNotification } from "../utils/pushNotifications";
import { createInlineImageDataUrl, fileToDataUrl, isLikelyImageFile, isSupabaseSchemaCompatibilityError, uploadFileWithSchemaRetry } from "../utils/supabaseStorageUpload";

const MESSAGE_ATTACHMENT_BUCKET = "message-attachments";
const MAX_ATTACHMENTS = 6;
const MAX_INLINE_ATTACHMENT_SIZE = 8 * 1024 * 1024;

const isMissingFunctionError = (error) => error?.code === "PGRST202" || error?.message?.toLowerCase().includes("function");

const normaliseAttachments = (attachments) => (Array.isArray(attachments) ? attachments : []);

const formatFileSize = (size) => {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

function MessageAttachmentList({ attachments, darkMode }) {
  const cleanAttachments = normaliseAttachments(attachments);
  const [signedUrls, setSignedUrls] = useState({});
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const paths = cleanAttachments.map(item => item.path).filter(Boolean);
    if (!paths.length) {
      setSignedUrls({});
      return;
    }

    supabase.storage
      .from(MESSAGE_ATTACHMENT_BUCKET)
      .createSignedUrls(paths, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const urls = {};
        (data || []).forEach(item => {
          if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
        });
        setSignedUrls(urls);
      });

    return () => {
      cancelled = true;
    };
  }, [JSON.stringify(cleanAttachments.map(item => item.path || item.name))]);

  if (!cleanAttachments.length) return null;

  return (
    <div className="mt-2 space-y-2">
      {cleanAttachments.map((attachment, index) => {
        const signedUrl = attachment.path ? signedUrls[attachment.path] : null;
        const inlineUrl = attachment.data_url || attachment.inline_url || "";
        const attachmentUrl = inlineUrl || signedUrl;
        const isImage = attachment.type?.startsWith("image/");
        const isPdf = attachment.type === "application/pdf" || /\.pdf$/i.test(attachment.name || attachment.path || "");
        const label = attachment.name || "Attachment";
        const content = (
          <>
            {isImage && attachmentUrl ? (
              <img src={attachmentUrl} alt="" className="h-12 w-12 rounded-md object-cover" />
            ) : (
              <span className={`grid h-12 w-12 place-items-center rounded-md ${darkMode ? "bg-black/20" : "bg-white"}`}>
                {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{label}</span>
              {attachment.size ? <span className="block text-[10px] font-semibold opacity-55">{formatFileSize(attachment.size)}</span> : null}
            </span>
          </>
        );
        const className = `flex items-center gap-3 rounded-lg border p-2 text-xs font-bold transition ${darkMode ? "border-white/10 bg-white/10 text-white hover:bg-white/15" : "border-[#DCEDEA] bg-[#F0F6F5] text-[#113247] hover:bg-white"}`;
        if (isImage && attachmentUrl) {
          return (
            <button
              key={`${attachment.path || label}-${index}`}
              type="button"
              onClick={() => setPreviewImage({ url: attachmentUrl, label })}
              className={`${className} w-full text-left`}
            >
              {content}
            </button>
          );
        }
        if (isPdf) {
          return (
            <button
              key={`${attachment.path || label}-${index}`}
              type="button"
              onClick={() => {
                if (!attachmentUrl) return toast.error("PDF link is still loading");
                // Supabase signed attachment URLs are passed to the shared in-app PDF viewer first.
                openPdfViewer({ source: attachmentUrl, filename: label, title: label });
              }}
              className={`${className} w-full text-left`}
            >
              {content}
            </button>
          );
        }
        return (
          <a
            key={`${attachment.path || label}-${index}`}
            href={attachmentUrl || undefined}
            download={inlineUrl ? label : undefined}
            target={inlineUrl ? undefined : "_blank"}
            rel="noreferrer"
            className={className}
          >
            {content}
          </a>
        );
      })}
      {previewImage && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4" onClick={() => setPreviewImage(null)}>
          <button type="button" className="absolute right-5 top-5 rounded-lg bg-white/15 p-2 text-white" aria-label="Close image preview">
            <X size={22} />
          </button>
          <img src={previewImage.url} alt={previewImage.label} className="max-h-[86vh] max-w-full rounded-xl object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}

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
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deletingConversation, setDeletingConversation] = useState(false);

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const messagePanelRef = useRef(null);
  const conversationListRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatItems]);

  useEffect(() => {
    if (!user?.id) return;
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
  }, [user?.id]);

  useEffect(() => {
    if (!activeChat?.id || !user?.id) return;
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
        if (payload.new.sender_id !== user.id) markAsRead(activeChat.id, [payload.new.id]);
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
    const adminContact = searchParams.get("admin");
    if (!conversationId && !colleagueId && !adminContact) return;

    if (adminContact === "1") {
      handleStartAdminChat();
      setSearchParams({}, { replace: true });
      return;
    }

    if (conversationId) {
      const existingConversation = conversations.find(c => String(c.id) === String(conversationId));
      if (existingConversation) {
        setActiveChat(existingConversation);
        setSearchParams({}, { replace: true });
        return;
      }
    }

    if (colleagueId) {
      const existingConversation = conversations.find(conversation => conversation.participantIds?.includes(colleagueId) || String(conversation.colleague?.id) === String(colleagueId));
      if (existingConversation) {
        setActiveChat(existingConversation);
        setSearchParams({}, { replace: true });
        return;
      }

      const colleague = colleagues.find(item => String(item?.id) === String(colleagueId));
      if (colleague) {
        handleStartDirectChat(colleague);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, setSearchParams, loading, user?.id, conversations, colleagues]);

  const refreshBadges = () => {
    window.dispatchEvent(new Event("messagesUpdated"));
    window.dispatchEvent(new Event("notificationsUpdated"));
  };

  const resetComposerState = () => {
    setSelectedRecipients([]);
    setGroupTitle("");
    setPendingAttachments([]);
    setNewMessage("");
  };

  const getDisplayName = (profile) => profile?.full_name || profile?.email || "Colleague";

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

    const formatted = (data || [])
      .map(conn => String(conn.requester_id) === String(user.id) ? conn.receiver : conn.requester)
      .filter(colleague => colleague && String(colleague.id) !== String(user.id));

    setColleagues(formatted);
  };

  const fetchDirectConversations = async (selectClause) => supabase
    .from("conversations")
    .select(selectClause)
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .order("updated_at", { ascending: false });

  const loadConversations = async () => {
    setLoading(true);
    try {
      const richSelect = `
        id, updated_at, user1_id, user2_id, is_group, title, created_by,
        user1:profiles!conversations_user1_id_fkey(id, full_name, title),
        user2:profiles!conversations_user2_id_fkey(id, full_name, title),
        conversation_participants(user_id, profile:profiles!conversation_participants_user_id_fkey(id, full_name, title)),
        messages ( id, content, attachments, created_at, sender_id, is_read )
      `;

      const { data: directData, error: directError } = await fetchDirectConversations(richSelect);
      if (directError) throw directError;

      const { data: participantRows, error: participantError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (participantError) throw participantError;

      const conversationIds = [...new Set((participantRows || []).map(row => row.conversation_id).filter(Boolean))];
      let participantData = [];
      if (conversationIds.length) {
        const { data, error } = await supabase
          .from("conversations")
          .select(richSelect)
          .in("id", conversationIds)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        participantData = data || [];
      }

      const merged = new Map();
      [...(directData || []), ...participantData].forEach(conversation => merged.set(String(conversation.id), conversation));
      setConversations([...merged.values()].map(conversation => formatConversation(conversation)).sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)));
    } catch (error) {
      const legacySelect = `
        id, updated_at, user1_id, user2_id,
        user1:profiles!conversations_user1_id_fkey(id, full_name, title),
        user2:profiles!conversations_user2_id_fkey(id, full_name, title),
        messages ( id, content, created_at, sender_id, is_read )
      `;
      const { data, error: fallbackError } = await fetchDirectConversations(legacySelect);
      if (fallbackError) {
        toast.error("Failed to load inbox");
      } else {
        setConversations((data || []).map(conversation => formatConversation(conversation)));
      }
    } finally {
      setLoading(false);
    }
  };

  const formatConversation = (conversation) => {
    const participantProfiles = (conversation.conversation_participants || [])
      .map(row => row.profile ? { ...row.profile, id: row.user_id || row.profile.id } : null)
      .filter(Boolean);
    const directProfiles = [conversation.user1, conversation.user2].filter(Boolean);
    const participantMap = new Map();
    [...participantProfiles, ...directProfiles].forEach(profile => {
      if (profile?.id) participantMap.set(String(profile.id), profile);
    });
    const participants = [...participantMap.values()];
    const participantIds = [
      ...participants.map(profile => profile.id),
      conversation.user1_id,
      conversation.user2_id
    ].filter(Boolean).map(String);
    const uniqueParticipantIds = [...new Set(participantIds)];
    const otherParticipants = participants.filter(profile => String(profile.id) !== String(user.id));
    const isGroup = conversation.is_group || otherParticipants.length > 1;
    const directColleague = String(conversation.user1_id) === String(user.id) ? conversation.user2 : conversation.user1;
    const colleague = isGroup
      ? {
        id: conversation.id,
        full_name: conversation.title || otherParticipants.map(getDisplayName).join(", ") || "Group message",
        title: `${Math.max(uniqueParticipantIds.length, otherParticipants.length + 1)} members`
      }
      : (directColleague || otherParticipants[0]);
    const sortedMessages = [...(conversation.messages || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const lastMsg = sortedMessages[0];
    const unread = sortedMessages.filter(message => String(message.sender_id) !== String(user.id) && !message.is_read).length;
    return {
      ...conversation,
      colleague,
      isGroup,
      participants,
      participantIds: uniqueParticipantIds,
      lastMsg,
      unread,
      messages: sortedMessages
    };
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

  const markRelatedNotificationsRead = async (conversationId, messageIds) => {
    if (!conversationId && !messageIds.length) return;
    const readAt = new Date().toISOString();
    const updatePayload = { is_read: true, read_at: readAt };
    const legacyPayload = { is_read: true };

    if (messageIds.length) {
      const result = await supabase
        .from("notifications")
        .update(updatePayload)
        .eq("user_id", user.id)
        .eq("type", "message")
        .in("related_id", messageIds.map(String));

      if (result.error && result.error.message?.includes("read_at")) {
        await supabase
          .from("notifications")
          .update(legacyPayload)
          .eq("user_id", user.id)
          .eq("type", "message")
          .in("related_id", messageIds.map(String));
      }
    }

    if (conversationId) {
      const result = await supabase
        .from("notifications")
        .update(updatePayload)
        .eq("user_id", user.id)
        .eq("type", "message")
        .contains("metadata", { conversation_id: conversationId });

      if (result.error && result.error.message?.includes("read_at")) {
        await supabase
          .from("notifications")
          .update(legacyPayload)
          .eq("user_id", user.id)
          .eq("type", "message")
          .contains("metadata", { conversation_id: conversationId });
      }
    }
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

    const rpcResult = await supabase.rpc("mark_conversation_messages_read", { conversation_uuid: conversationId });
    let saveError = rpcResult.error;

    if (rpcResult.error && isMissingFunctionError(rpcResult.error)) {
      const directResult = await directMarkMessagesRead(conversationId);
      saveError = directResult.error;
    }

    if (saveError) {
      toast.error("Read status could not be saved. Please run the latest Supabase SQL update.");
      return;
    }

    await markRelatedNotificationsRead(conversationId, idsToMark);
    applyReadStateLocally(conversationId);
    if (activeTab === "unread") setActiveTab("read");
  };

  const deleteConversation = async (chat) => {
    if (!chat?.id || deletingConversation) return;
    setDeletingConversation(true);

    if (chat.isGroup) {
      const { error } = await supabase
        .from("conversation_participants")
        .delete()
        .eq("conversation_id", chat.id)
        .eq("user_id", user.id);

      if (error) {
        toast.error("Could not leave conversation");
        setDeletingConversation(false);
        return;
      }
    } else {
      const { error: messagesError } = await supabase.from("messages").delete().eq("conversation_id", chat.id);
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
    }

    setConversations(prev => prev.filter(conversation => conversation.id !== chat.id));
    if (activeChat?.id === chat.id) {
      setActiveChat(null);
      setChatItems([]);
    }
    setDeleteCandidate(null);
    setDeletingConversation(false);
    refreshBadges();
    toast.success(chat.isGroup ? "Conversation left" : "Conversation deleted");
  };

  const handleStartDirectChat = async (colleague) => {
    if (!colleague?.id) return;

    let conversation = conversations.find(item => !item.isGroup && String(item.colleague?.id) === String(colleague.id));
    if (!conversation) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user1_id: user.id, user2_id: colleague.id })
        .select("id, updated_at, user1_id, user2_id")
        .single();

      if (error) throw error;

      conversation = {
        ...data,
        colleague,
        isGroup: false,
        participants: [colleague],
        participantIds: [String(user.id), String(colleague.id)],
        lastMsg: null,
        unread: 0,
        messages: []
      };
      setConversations(prev => [conversation, ...prev]);
    }

    setActiveChat(conversation);
    setIsNewChatMode(false);
    setSearchQuery("");
    resetComposerState();
  };

  const handleStartAdminChat = async () => {
    if (startingChat) return;
    setStartingChat(true);
    toast.loading("Opening Admin message...", { id: "chat_setup" });

    try {
      const { data, error } = await supabase.rpc("get_or_create_admin_support_conversation");
      if (error) throw error;

      await loadConversations();
      const existingConversation = conversations.find(item => String(item.id) === String(data));
      const conversation = existingConversation || {
        id: data,
        updated_at: new Date().toISOString(),
        user1_id: user.id,
        user2_id: user.id,
        isGroup: true,
        title: "Admin",
        colleague: {
          id: "admin",
          full_name: "Admin",
          title: "VetLearn Support"
        },
        participants: [],
        participantIds: [String(user.id)],
        lastMsg: null,
        unread: 0,
        messages: []
      };

      setActiveChat(conversation);
      setIsNewChatMode(false);
      setSearchQuery("");
      resetComposerState();
      toast.success("Admin message ready", { id: "chat_setup" });
    } catch (error) {
      toast.error("Could not open Admin message. Please run the latest Supabase SQL update.", { id: "chat_setup" });
    } finally {
      setStartingChat(false);
    }
  };

  const handleStartSelectedChat = async () => {
    if (!selectedRecipients.length || startingChat) return;
    setStartingChat(true);
    toast.loading("Starting message...", { id: "chat_setup" });

    try {
      if (selectedRecipients.length === 1) {
        await handleStartDirectChat(selectedRecipients[0]);
      } else {
        const { data, error } = await supabase.rpc("create_group_conversation", {
          participant_ids: selectedRecipients.map(item => item.id),
          conversation_title: groupTitle.trim() || null
        });
        if (error) throw error;

        await loadConversations();
        const fallbackConversation = {
          id: data,
          updated_at: new Date().toISOString(),
          user1_id: user.id,
          user2_id: selectedRecipients[0]?.id,
          isGroup: true,
          title: groupTitle.trim() || selectedRecipients.map(getDisplayName).join(", "),
          colleague: {
            id: data,
            full_name: groupTitle.trim() || selectedRecipients.map(getDisplayName).join(", "),
            title: `${selectedRecipients.length + 1} members`
          },
          participants: selectedRecipients,
          participantIds: [String(user.id), ...selectedRecipients.map(item => String(item.id))],
          lastMsg: null,
          unread: 0,
          messages: []
        };
        setActiveChat(fallbackConversation);
        setIsNewChatMode(false);
        setSearchQuery("");
        resetComposerState();
      }
      toast.success("Message ready", { id: "chat_setup" });
    } catch (error) {
      toast.error("Could not create message. Please run the latest Supabase SQL update.", { id: "chat_setup" });
    } finally {
      setStartingChat(false);
    }
  };

  const toggleRecipient = (colleague) => {
    setSelectedRecipients(prev => {
      if (prev.some(item => String(item.id) === String(colleague.id))) {
        return prev.filter(item => String(item.id) !== String(colleague.id));
      }
      return [...prev, colleague];
    });
  };

  const handleAttachmentPick = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setPendingAttachments(prev => {
      const next = [...prev, ...files].slice(0, MAX_ATTACHMENTS);
      if (prev.length + files.length > MAX_ATTACHMENTS) toast.error(`Maximum ${MAX_ATTACHMENTS} attachments per message`);
      return next;
    });
    event.target.value = "";
  };

  const uploadMessageAttachments = async (conversationId, files) => {
    const uploaded = [];
    for (const file of files) {
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const randomId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const path = `${conversationId}/${randomId}-${cleanName}`;
      const { error } = await uploadFileWithSchemaRetry({
        bucket: MESSAGE_ATTACHMENT_BUCKET,
        path,
        file,
        options: { upsert: false, contentType: file.type || "application/octet-stream" }
      });
      if (error) {
        if (isSupabaseSchemaCompatibilityError(error) && file.size <= MAX_INLINE_ATTACHMENT_SIZE) {
          uploaded.push({
            data_url: isLikelyImageFile(file) ? await createInlineImageDataUrl(file, { maxSide: 1200, quality: 0.74 }) : await fileToDataUrl(file),
            inline: true,
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size
          });
          continue;
        }
        throw error;
      }
      uploaded.push({ path, name: file.name, type: file.type, size: file.size });
    }
    return uploaded;
  };

  const isAdminSupportConversation = (chat) => {
    if (!chat) return false;
    return String(chat.colleague?.id || "").toLowerCase() === "admin"
      || String(chat.title || "").trim().toLowerCase() === "admin";
  };

  const notifyRecipients = async (message) => {
    const senderName = user?.user_metadata?.full_name || "A colleague";
    const preview = message.content || (normaliseAttachments(message.attachments).length ? "Attachment" : "New message");

    if (isAdminSupportConversation(activeChat)) {
      await sendAdminSupportPushNotification({
        title: "New Admin message",
        body: `${senderName}: ${preview}`,
        messageId: message.id,
        conversationId: activeChat.id
      });
      return;
    }

    const recipientIds = (activeChat.participantIds?.length ? activeChat.participantIds : [activeChat.user1_id, activeChat.user2_id])
      .filter(Boolean)
      .map(String)
      .filter((id, index, array) => id !== String(user.id) && array.indexOf(id) === index);

    recipientIds.forEach(recipientId => {
      sendMessagePushNotification({
        recipientId,
        title: "New message",
        body: `${senderName}: ${preview}`,
        messageId: message.id,
        conversationId: activeChat.id,
        route: `/messages?conversation=${activeChat.id}`
      });
    });
  };

  const handleSend = async (event) => {
    if (event) event.preventDefault();
    if ((!newMessage.trim() && pendingAttachments.length === 0) || !activeChat || sending) return;

    const content = newMessage.trim();
    const cachedMessage = newMessage;
    const cachedAttachments = pendingAttachments;
    setNewMessage("");
    setPendingAttachments([]);
    setSending(true);

    let attachments = [];
    let messageSaved = false;
    try {
      attachments = cachedAttachments.length ? await uploadMessageAttachments(activeChat.id, cachedAttachments) : [];
      const rpcResult = await supabase.rpc("send_conversation_message", {
        conversation_uuid: activeChat.id,
        message_body: content,
        message_attachments: attachments
      });

      let data = null;
      let saveError = rpcResult.error;
      if (!rpcResult.error && rpcResult.data) {
        const messageResult = await supabase.from("messages").select("*").eq("id", rpcResult.data).single();
        data = messageResult.data;
        saveError = messageResult.error;
      }

      if (rpcResult.error && isMissingFunctionError(rpcResult.error)) {
        const insertPayload = { conversation_id: activeChat.id, sender_id: user.id, content, is_read: false };
        if (attachments.length) insertPayload.attachments = attachments;
        const insertResult = await supabase
          .from("messages")
          .insert(insertPayload)
          .select()
          .single();
        data = insertResult.data;
        saveError = insertResult.error;
      }

      if (saveError) throw saveError;
      messageSaved = true;

      setChatItems(prev => prev.some(item => item.id === data.id) ? prev : [...prev, data]);
      setConversations(prev => prev.map(conversation => conversation.id === activeChat.id ? { ...conversation, lastMsg: data, messages: [data, ...(conversation.messages || [])], updated_at: data.created_at } : conversation));
      notifyRecipients(data);
      chatInputRef.current?.focus();
    } catch (error) {
      if (!messageSaved && attachments.length) {
        await supabase.storage.from(MESSAGE_ATTACHMENT_BUCKET).remove(attachments.map(item => item.path).filter(Boolean));
      }
      toast.error(isSupabaseSchemaCompatibilityError(error) ? "Could not upload the attachment because Supabase storage rejected the file request." : "Message failed to send");
      setNewMessage(cachedMessage);
      setPendingAttachments(cachedAttachments);
    } finally {
      setSending(false);
    }
  };

  const unreadConversations = useMemo(() => conversations.filter(conversation => conversation.unread > 0), [conversations]);
  const readConversations = useMemo(() => conversations.filter(conversation => conversation.unread === 0 && conversation.lastMsg), [conversations]);
  const allConversations = useMemo(() => conversations.filter(conversation => conversation.lastMsg || conversation.unread > 0), [conversations]);
  const unreadMessageCount = useMemo(() => conversations.reduce((total, conversation) => total + conversation.unread, 0), [conversations]);

  const visibleConversations = useMemo(() => {
    const source = activeTab === "unread" ? unreadConversations : activeTab === "read" ? readConversations : allConversations;
    if (!searchQuery) return source;
    const query = searchQuery.toLowerCase();
    return source.filter(conversation =>
      conversation.colleague?.full_name?.toLowerCase().includes(query)
      || conversation.participants?.some(profile => getDisplayName(profile).toLowerCase().includes(query))
    );
  }, [activeTab, allConversations, readConversations, searchQuery, unreadConversations]);

  const filteredColleagues = useMemo(() => {
    if (!searchQuery) return colleagues;
    return colleagues.filter(colleague => colleague?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [colleagues, searchQuery]);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-xl shadow-[0_14px_35px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden"
    : "bg-white/90 border border-[#DCEDEA] rounded-xl shadow-[0_14px_35px_rgba(11,55,96,0.07)] flex flex-col overflow-hidden";
  const textPrimary = darkMode ? "text-white" : "text-[#113247]";
  const tabClass = (tab) => `px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition shrink-0 ${
    activeTab === tab
      ? "bg-[#71CFC2] text-[#062F63] shadow-md"
      : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"
  }`;
  const selectConversationTab = (tab) => {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      messagePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      conversationListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  return (
    <div className="pb-8">
      <PageBanner
        title="Messages"
        subtitle="Keep track of conversations, unread updates and shared clinical records."
        darkMode={darkMode}
      />

      <div className="h-[calc(100vh-300px)] min-h-[520px] w-full max-w-4xl mx-auto relative flex flex-col">
        {!activeChat && !isNewChatMode && (
          <div className="mb-4 flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
            <button className={tabClass("unread")} onClick={() => selectConversationTab("unread")}>Unread {unreadConversations.length}</button>
            <button className={tabClass("read")} onClick={() => selectConversationTab("read")}>Read</button>
            <button className={tabClass("all")} onClick={() => selectConversationTab("all")}>All</button>
          </div>
        )}

        {!activeChat && (
          <div ref={messagePanelRef} className={`w-full flex-1 min-h-0 ${panelClass}`}>
            <div className="p-4 border-b border-inherit">
              <div className="flex justify-between items-start gap-3 mb-4">
                <div>
                  <h2 className={`text-xl font-black ${textPrimary}`}>{isNewChatMode ? "New message" : "Messages"}</h2>
                  <p className="mt-1 text-xs font-semibold opacity-55">{isNewChatMode ? "Choose one or more colleagues." : `${unreadMessageCount} unread message${unreadMessageCount === 1 ? "" : "s"}`}</p>
                </div>
                <button
                  onClick={() => {
                    setIsNewChatMode(!isNewChatMode);
                    setSearchQuery("");
                    resetComposerState();
                  }}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition-colors ${isNewChatMode ? darkMode ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-600" : "bg-[#71CFC2] text-[#062F63] shadow-sm"}`}
                  title={isNewChatMode ? "Cancel" : "New Message"}
                >
                  {isNewChatMode ? <X size={16} /> : <Edit size={16} />}
                  <span>{isNewChatMode ? "Cancel" : "Compose"}</span>
                </button>
              </div>

              {isNewChatMode && (
                <div className={`mb-4 rounded-xl border p-4 ${darkMode ? "border-white/10 bg-black/20" : "border-[#DCEDEA] bg-[#F8FCFB]"}`}>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {selectedRecipients.length === 0 ? (
                      <span className="text-sm font-semibold opacity-55">Choose one or more colleagues</span>
                    ) : selectedRecipients.map(recipient => (
                      <button key={recipient.id} onClick={() => toggleRecipient(recipient)} className="flex items-center gap-2 rounded-full bg-[#71CFC2] px-3 py-1.5 text-xs font-black text-[#062F63]">
                        {getDisplayName(recipient)}
                        <X size={13} />
                      </button>
                    ))}
                  </div>
                  {selectedRecipients.length > 1 && (
                    <input
                      type="text"
                      value={groupTitle}
                      onChange={(event) => setGroupTitle(event.target.value)}
                      placeholder="Group name (optional)"
                      className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none ${darkMode ? "border-white/10 bg-[#071A24] text-white" : "border-[#DCEDEA] bg-white text-[#113247]"}`}
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleStartSelectedChat}
                    disabled={!selectedRecipients.length || startingChat}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#71CFC2] px-4 py-3 text-sm font-black text-[#062F63] shadow-sm disabled:opacity-45"
                  >
                    {startingChat ? <Loader2 size={16} className="animate-spin" /> : selectedRecipients.length > 1 ? <Users size={16} /> : <MessageSquare size={16} />}
                    {selectedRecipients.length > 1 ? "Start group message" : "Start message"}
                  </button>
                </div>
              )}

              <div className={`flex items-center px-3 py-2.5 rounded-xl border ${darkMode ? "bg-black/20 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <Search size={16} className="opacity-50 mr-2 shrink-0" />
                <input type="text" placeholder={isNewChatMode ? "Search network..." : "Search conversations..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full" />
              </div>
            </div>

            <div ref={conversationListRef} className="flex-1 space-y-3 overflow-y-auto p-3">
              {isNewChatMode ? (
                filteredColleagues.length === 0 ? <div className="p-8 text-center opacity-50 text-sm">No colleagues found in your network.</div> : filteredColleagues.map(colleague => {
                  const selected = selectedRecipients.some(item => String(item.id) === String(colleague.id));
                  return (
                    <button key={colleague.id} onClick={() => toggleRecipient(colleague)} className={`w-full rounded-2xl border p-4 text-left transition-colors flex items-center gap-4 ${selected ? "border-[#71CFC2] bg-[#71CFC2]/15" : darkMode ? "border-white/10 bg-white/[0.06] hover:bg-white/10" : "border-[#DCEDEA] bg-white hover:bg-[#F8FCFB]"}`}>
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 font-bold text-lg ${selected ? "bg-[#71CFC2] text-[#062F63]" : "bg-[#E8F8F5] text-[#0F8F83]"}`}>{selected ? <Check size={20} /> : colleague?.full_name?.charAt(0) || <User size={20} />}</div>
                      <div className="flex-1 min-w-0">
                        <span className={`font-bold text-lg block ${textPrimary}`}>{colleague?.full_name}</span>
                        <span className="text-sm opacity-60 block">{colleague?.title || "Veterinary Professional"}</span>
                      </div>
                    </button>
                  );
                })
              ) : loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#71CFC2]" size={28} /></div>
              ) : visibleConversations.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center opacity-55">
                  <MessageSquareX size={36} className="mb-3 opacity-50" />
                  <p className="mb-1 text-base font-black">{activeTab === "unread" ? "No unread messages" : activeTab === "read" ? "No read conversations" : "No conversations"}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewChatMode(true);
                      setSearchQuery("");
                      resetComposerState();
                    }}
                    className="mt-4 rounded-lg bg-[#71CFC2] px-4 py-2.5 text-xs font-black text-[#062F63] shadow-sm"
                  >
                    Compose
                  </button>
                </div>
              ) : visibleConversations.map(chat => {
                const isUnread = chat.unread > 0;
                const lastMessageText = chat.lastMsg?.content || (normaliseAttachments(chat.lastMsg?.attachments).length ? "Attachment" : "No messages yet");
                return (
                  <div key={chat.id} className={`w-full rounded-2xl border p-4 transition-colors flex items-center gap-4 ${isUnread ? "border-[#71CFC2] bg-[#71CFC2]/10" : darkMode ? "border-white/10 bg-white/[0.06] hover:bg-white/10" : "border-[#DCEDEA] bg-white hover:bg-[#F8FCFB]"}`}>
                    <button onClick={() => setActiveChat(chat)} className="flex-1 min-w-0 text-left flex items-center gap-4">
                      <div className={`${isUnread ? "bg-[#71CFC2] text-[#0B3760]" : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"} h-12 w-12 rounded-full flex items-center justify-center shrink-0 font-bold text-lg`}>{chat.isGroup ? <Users size={20} /> : chat.colleague?.full_name?.charAt(0) || <User size={20} />}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className={`${isUnread ? "font-black" : "font-bold opacity-80"} text-lg truncate ${textPrimary}`}>{chat.colleague?.full_name}</span>
                          {chat.lastMsg && <span className="text-xs font-medium opacity-50 whitespace-nowrap ml-2">{new Date(chat.lastMsg.created_at).toLocaleDateString()}</span>}
                        </div>
                        <div className={`${isUnread ? "font-semibold opacity-90" : "opacity-60"} text-sm truncate`}>{chat.lastMsg?.sender_id === user.id && "You: "}{lastMessageText}</div>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      {isUnread && <div className="h-6 min-w-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center px-2 shadow-md">{chat.unread}</div>}
                      <IconButton
                        icon={Trash2}
                        label={chat.isGroup ? "Leave conversation" : "Delete conversation"}
                        variant="danger"
                        darkMode={darkMode}
                        onClick={(event) => { event.stopPropagation(); setDeleteCandidate(chat); }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeChat && (
          <div className={`w-full h-full animate-in fade-in zoom-in-95 duration-200 ${panelClass}`}>
            <div className={`p-5 border-b flex justify-between items-center z-10 ${darkMode ? "border-white/10" : "border-slate-100"}`}>
              <div className="flex items-center gap-3">
                <IconButton icon={ArrowLeft} label="Back to conversations" darkMode={darkMode} onClick={() => setActiveChat(null)} />
                <div className="h-11 w-11 rounded-full bg-[#E8F8F5] text-[#0F8F83] flex items-center justify-center font-black text-lg shadow-inner">{activeChat.isGroup ? <Users size={18} /> : activeChat.colleague?.full_name?.charAt(0) || <User size={18} />}</div>
                <div>
                  <h3 className={`font-black text-lg leading-tight ${textPrimary}`}>{activeChat.colleague?.full_name}</h3>
                  <p className="text-xs font-bold opacity-50">{activeChat.isGroup ? activeChat.colleague?.title : "VetLearn Messenger"}</p>
                </div>
              </div>
              <IconButton icon={X} label="Close conversation" darkMode={darkMode} onClick={() => setActiveChat(null)} />
            </div>

            <div className={`flex-1 overflow-y-auto p-6 space-y-4 ${darkMode ? "bg-black/10" : "bg-slate-50/50"}`}>
              {chatLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#71CFC2]" /></div> : chatItems.length === 0 && <div className="text-center opacity-40 text-sm mt-10">This is the start of your conversation.</div>}

              {chatItems.map(item => {
                const isMe = item.sender_id === user.id;
                return (
                  <div key={item.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${isMe ? "bg-[#71CFC2] text-[#0B3760] font-medium rounded-br-sm" : darkMode ? "bg-white/10 text-white rounded-bl-sm" : "bg-white border border-slate-100 text-[#113247] rounded-bl-sm"}`}>
                      {item.content && <div className="whitespace-pre-wrap">{item.content}</div>}
                      <MessageAttachmentList attachments={item.attachments} darkMode={darkMode} />
                    </div>
                    <div className="flex items-center gap-1 mt-1 px-1"><span className="text-[10px] opacity-40">{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{isMe && <span className={item.is_read ? "text-[#0F8F83]" : "opacity-30"}><CheckCheck size={14} /></span>}</div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className={`p-4 border-t ${darkMode ? "bg-[#071A24] border-white/10" : "bg-white border-slate-100"}`}>
              {pendingAttachments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {pendingAttachments.map((file, index) => (
                    <button
                      key={`${file.name}-${index}`}
                      type="button"
                      onClick={() => setPendingAttachments(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                      className={`flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#113247]"}`}
                    >
                      <Paperclip size={13} />
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      <X size={13} />
                    </button>
                  ))}
                </div>
              )}
              <div className={`flex gap-3 items-center rounded-lg p-3 border ${darkMode ? "bg-white/10 border-white/10" : "bg-[#F0F6F5] border-[#DCEDEA]"}`}>
                <input ref={attachmentInputRef} type="file" multiple className="hidden" onChange={handleAttachmentPick} />
                <IconButton icon={Paperclip} label="Add attachment" darkMode={darkMode} className="!h-11 !w-11" onClick={() => attachmentInputRef.current?.click()} />
                <textarea ref={chatInputRef} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." className={`flex-1 rounded-lg px-4 py-3 text-sm border-none outline-none resize-none max-h-12 overflow-hidden ${darkMode ? "bg-[#071A24] text-white placeholder:text-slate-400" : "bg-white text-[#113247] placeholder:text-slate-400"}`} rows={1} />
                <button type="submit" disabled={(!newMessage.trim() && pendingAttachments.length === 0) || sending} className="h-11 w-11 rounded-lg bg-[#71CFC2] text-[#0B3760] flex items-center justify-center disabled:opacity-40 disabled:grayscale transition-all shrink-0">{sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-1" />}</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {deleteCandidate && (
        <AppPopup
          open={!!deleteCandidate}
          onClose={() => !deletingConversation && setDeleteCandidate(null)}
          darkMode={darkMode}
          {...popupPresets.deleteConversation({
            colleagueName: deleteCandidate.colleague?.full_name,
            onPrimary: () => deleteConversation(deleteCandidate),
            onSecondary: () => setDeleteCandidate(null),
            primaryLoading: deletingConversation,
            primaryDisabled: deletingConversation,
            secondaryDisabled: deletingConversation
          })}
        />
      )}
    </div>
  );
}
