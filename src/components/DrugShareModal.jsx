import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, Share2, Users } from "lucide-react";
import toast from "react-hot-toast";
import AppPopup from "./AppPopup";
import { supabase } from "../supabaseClient";

export default function DrugShareModal({ open, drug, user, darkMode = false, onClose }) {
  const [mode, setMode] = useState("read");
  const [colleagues, setColleagues] = useState([]);
  const [existingAccess, setExistingAccess] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user?.id || !drug?.id) return undefined;

    let active = true;
    const loadSharingOptions = async () => {
      setLoading(true);
      setMode("read");
      setSearch("");
      setSelectedIds([]);

      const [connectionsResult, accessResult] = await Promise.all([
        supabase
          .from("connections")
          .select(`
            id, requester_id, receiver_id,
            requester:profiles!connections_requester_id_fkey(id, avatar_url, full_name, title),
            receiver:profiles!connections_receiver_id_fkey(id, avatar_url, full_name, title)
          `)
          .eq("status", "accepted")
          .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`),
        supabase
          .from("drug_collaborators")
          .select("user_id, permission")
          .eq("drug_id", drug.id)
          .eq("owner_id", user.id)
      ]);

      if (!active) return;

      if (connectionsResult.error) {
        console.error("Could not load colleagues for drug sharing", connectionsResult.error);
        toast.error("Could not load your colleagues");
        setColleagues([]);
      } else {
        setColleagues((connectionsResult.data || []).map((connection) => ({
          connectionId: connection.id,
          colleague: connection.requester_id === user.id ? connection.receiver : connection.requester
        })).filter((entry) => entry.colleague?.id));
      }

      if (accessResult.error) {
        console.error("Could not load existing drug access", accessResult.error);
        setExistingAccess({});
      } else {
        setExistingAccess(Object.fromEntries(
          (accessResult.data || []).map((entry) => [String(entry.user_id), entry.permission])
        ));
      }

      setLoading(false);
    };

    loadSharingOptions();
    return () => {
      active = false;
    };
  }, [drug?.id, open, user?.id]);

  const filteredColleagues = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return colleagues;
    return colleagues.filter(({ colleague }) => (
      [colleague?.full_name, colleague?.title]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    ));
  }, [colleagues, search]);

  const toggleColleague = (colleagueId) => {
    const id = String(colleagueId);
    setSelectedIds((current) => (
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    ));
  };

  const submitShare = async () => {
    if (!drug?.id || !user?.id || selectedIds.length === 0 || saving) return;
    setSaving(true);

    const permission = mode === "edit" ? "edit" : "read";
    const rows = selectedIds.map((colleagueId) => ({
      drug_id: drug.id,
      owner_id: user.id,
      user_id: colleagueId,
      permission
    }));

    const { error } = await supabase
      .from("drug_collaborators")
      .upsert(rows, { onConflict: "drug_id,user_id" });

    if (error) {
      console.error("Drug sharing failed", { drugId: drug.id, selectedIds, permission, error });
      setSaving(false);
      toast.error(error.message || "Could not update drug access");
      return;
    }

    const actionText = permission === "edit" ? "invited you to collaborate on" : "shared";
    const { error: notificationError } = await supabase.from("notifications").insert(
      selectedIds.map((colleagueId) => ({
        user_id: colleagueId,
        type: "shared_drug",
        title: permission === "edit" ? "Drug collaboration invitation" : "Drug shared with you",
        message: `${user.email || "A colleague"} ${actionText} "${drug.name}".`,
        is_read: false,
        related_id: String(drug.id)
      }))
    );

    if (notificationError) {
      console.warn("Drug access was updated but notifications could not be created", notificationError);
    }

    setSaving(false);
    toast.success(
      permission === "edit"
        ? `${selectedIds.length} collaborator${selectedIds.length === 1 ? "" : "s"} invited`
        : `Drug shared with ${selectedIds.length} colleague${selectedIds.length === 1 ? "" : "s"}`
    );
    onClose();
  };

  return (
    <AppPopup
      open={open}
      onClose={onClose}
      darkMode={darkMode}
      icon={mode === "edit" ? Users : Share2}
      title={mode === "edit" ? "Invite collaborators" : "Share My Drug"}
      message={drug?.name || "Selected drug"}
      primaryLabel={mode === "edit" ? "Invite collaborators" : "Share drug"}
      primaryLoadingLabel={mode === "edit" ? "Inviting..." : "Sharing..."}
      primaryLoading={saving}
      primaryDisabled={loading || selectedIds.length === 0}
      secondaryLabel="Cancel"
      footerLabel="DRUG ACCESS"
      onPrimary={submitShare}
      onSecondary={onClose}
      zIndex={180}
    >
      <div className="space-y-4">
        <div className={`grid grid-cols-2 gap-2 rounded-2xl p-1 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
          <button
            type="button"
            onClick={() => setMode("read")}
            disabled={saving}
            className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${
              mode === "read"
                ? "bg-[#71CFC2] text-[#062F63] shadow-sm"
                : darkMode ? "text-slate-300" : "text-slate-500"
            }`}
          >
            Share
          </button>
          <button
            type="button"
            onClick={() => setMode("edit")}
            disabled={saving}
            className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${
              mode === "edit"
                ? "bg-[#71CFC2] text-[#062F63] shadow-sm"
                : darkMode ? "text-slate-300" : "text-slate-500"
            }`}
          >
            Collaborate
          </button>
        </div>

        <p className={`text-xs leading-5 ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
          {mode === "edit"
            ? "Selected colleagues can edit the live monograph with you."
            : "Selected colleagues can open the monograph but cannot edit it."}
        </p>

        <div className={`flex items-center gap-2 rounded-xl border px-3 ${darkMode ? "border-white/10 bg-white/5" : "border-[#DCEDEA] bg-[#F9FCFB]"}`}>
          <Search size={16} className="shrink-0 opacity-45" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search colleagues..."
            className="w-full bg-transparent py-3 text-sm outline-none"
          />
        </div>

        {loading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="animate-spin text-[#71CFC2]" />
          </div>
        ) : colleagues.length === 0 ? (
          <div className={`rounded-xl p-4 text-center text-sm ${darkMode ? "bg-white/5 text-slate-300" : "bg-[#F0F6F5] text-slate-600"}`}>
            No colleagues are available. Add a colleague from the Network page first.
          </div>
        ) : filteredColleagues.length === 0 ? (
          <div className="py-5 text-center text-sm opacity-55">No colleagues match that search.</div>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {filteredColleagues.map(({ connectionId, colleague }) => {
              const colleagueId = String(colleague.id);
              const selected = selectedIds.includes(colleagueId);
              const currentPermission = existingAccess[colleagueId];
              return (
                <button
                  key={connectionId}
                  type="button"
                  onClick={() => toggleColleague(colleagueId)}
                  disabled={saving}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                    selected
                      ? "border-[#71CFC2] bg-[#E8F8F5] text-[#113247]"
                      : darkMode
                        ? "border-white/10 bg-white/5"
                        : "border-[#DCEDEA] bg-white"
                  }`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-black ${selected ? "bg-[#71CFC2] text-[#062F63]" : "bg-[#F0F6F5] text-[#0F8F83]"}`}>
                    {selected ? <Check size={17} /> : colleague.full_name?.charAt(0) || "V"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">
                      {[colleague.title, colleague.full_name].filter(Boolean).join(" ") || "VetLearn colleague"}
                    </span>
                    <span className="block text-[11px] opacity-55">
                      {currentPermission === "edit" ? "Already a collaborator" : currentPermission === "read" ? "Already shared read-only" : "Connected colleague"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selectedIds.length > 0 && (
          <p className="text-center text-xs font-black text-[#0F8F83] dark:text-[#71CFC2]">
            {selectedIds.length} colleague{selectedIds.length === 1 ? "" : "s"} selected
          </p>
        )}
      </div>
    </AppPopup>
  );
}
