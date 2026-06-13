import { useEffect, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../supabaseClient";

export default function ShareReadingWithColleagueModal({ user, item, darkMode = false, onClose }) {
  const [colleagues, setColleagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!user?.id) return;

    const loadColleagues = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("connections")
        .select(`
          id, requester_id, receiver_id,
          requester:profiles!connections_requester_id_fkey(id, avatar_url, full_name, title),
          receiver:profiles!connections_receiver_id_fkey(id, avatar_url, full_name, title)
        `)
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (error) {
        console.error("Could not load colleagues for reading share", error);
        toast.error("Could not load your colleagues");
        setColleagues([]);
      } else {
        setColleagues((data || []).map(connection => ({
          connectionId: connection.id,
          colleague: connection.requester_id === user.id ? connection.receiver : connection.requester
        })));
      }
      setLoading(false);
    };

    loadColleagues();
  }, [user?.id]);

  const shareWith = async (colleague) => {
    if (!colleague?.id || busyId) return;
    setBusyId(colleague.id);

    try {
      const conversation = await getOrCreateConversation(user.id, colleague.id);
      const { data: message, error: messageError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          sender_id: user.id,
          content: buildReadingMessage(item),
          is_read: false
        })
        .select("id")
        .single();

      if (messageError) throw messageError;

      const { error: notificationError } = await supabase.from("notifications").insert({
        user_id: colleague.id,
        type: "message",
        title: "Shared reading",
        message: `${user.email || "A colleague"} shared "${item.title}" with you.`,
        is_read: false,
        related_id: String(message.id)
      });

      if (notificationError) {
        console.error("Reading was shared but notification creation failed", notificationError);
      }

      toast.success(`Shared with ${colleague.full_name || "colleague"}`);
      window.dispatchEvent(new Event("messagesUpdated"));
      onClose();
    } catch (error) {
      console.error("Reading share failed", { itemId: item?.id, colleagueId: colleague.id, error });
      toast.error(error?.message || "Could not share this reading");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className={`w-full max-w-md rounded-t-2xl p-5 shadow-2xl sm:rounded-2xl ${darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]"}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Send to a colleague</h2>
            <p className="mt-1 text-sm opacity-65">Share “{item.title}” in a secure VetLearn conversation.</p>
          </div>
          <button type="button" onClick={onClose} className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${darkMode ? "bg-white/10" : "bg-[#E8F8F5]"}`}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="grid place-items-center py-10"><Loader2 className="animate-spin text-[#71CFC2]" /></div>
        ) : colleagues.length === 0 ? (
          <div className={`rounded-xl p-5 text-center text-sm ${darkMode ? "bg-white/10 text-slate-300" : "bg-[#F0F6F5] text-slate-600"}`}>
            Add a colleague from the Network page before sharing directly.
          </div>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {colleagues.map(({ connectionId, colleague }) => (
              <div key={connectionId} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${darkMode ? "border-white/10 bg-white/5" : "border-[#DCEDEA] bg-[#F9FCFB]"}`}>
                <div className="min-w-0">
                  <p className="truncate font-black">{[colleague?.title, colleague?.full_name].filter(Boolean).join(" ") || "VetLearn colleague"}</p>
                  <p className="truncate text-xs opacity-55">Connected colleague</p>
                </div>
                <button
                  type="button"
                  onClick={() => shareWith(colleague)}
                  disabled={!!busyId}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-[#71CFC2] px-3 py-2 text-sm font-black text-[#062F63] disabled:opacity-50"
                >
                  {busyId === colleague?.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Send
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function getOrCreateConversation(userId, colleagueId) {
  const { data: conversations, error: loadError } = await supabase
    .from("conversations")
    .select("id, user1_id, user2_id")
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

  if (loadError) throw loadError;

  const existing = (conversations || []).find(conversation =>
    (conversation.user1_id === userId && conversation.user2_id === colleagueId) ||
    (conversation.user2_id === userId && conversation.user1_id === colleagueId)
  );
  if (existing) return existing;

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user1_id: userId, user2_id: colleagueId })
    .select("id, user1_id, user2_id")
    .single();

  if (error) throw error;
  return data;
}

function buildReadingMessage(item) {
  const url = item.article_url || item.url || item.link;
  const notes = item.user_reflection || item.reflection || item.notes;
  return [
    "Shared VetLearn reading",
    item.title,
    item.category ? `Category: ${item.category}` : null,
    item.duration_minutes ? `CPD time: ${item.duration_minutes} minutes` : null,
    item.due_date ? `Planned for: ${new Date(item.due_date).toLocaleDateString()}` : null,
    url ? `Article: ${url}` : null,
    notes ? `Notes: ${notes}` : null
  ].filter(Boolean).join("\n");
}
