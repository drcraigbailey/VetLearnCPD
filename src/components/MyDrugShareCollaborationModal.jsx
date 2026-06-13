import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, Share2, UserPlus, X } from "lucide-react";

export default function MyDrugShareCollaborationModal({
  open,
  darkMode = false,
  drug,
  mode = "share",
  setMode,
  colleagues = [],
  loading = false,
  busy = false,
  focusRecipients = false,
  onClose,
  onSubmit
}) {
  const [query, setQuery] = useState("");
  const [selectedColleagueId, setSelectedColleagueId] = useState("");
  const shareRecipientSectionRef = useRef(null);
  const colleagueSearchInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedColleagueId("");
  }, [drug?.id, drug?.name, open]);

  useEffect(() => {
    if (!open || !focusRecipients) return;
    const timer = window.setTimeout(() => {
      shareRecipientSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      colleagueSearchInputRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusRecipients, open]);

  const filteredColleagues = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return colleagues;
    return colleagues.filter((colleague) => [colleague?.full_name, colleague?.title, colleague?.practice_name].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [colleagues, query]);

  if (!open) return null;

  const actionLabel = mode === "collaborate" ? "Invite collaborator" : "Send monograph";
  const selectedColleague = colleagues.find((colleague) => colleague?.id === selectedColleagueId);

  return (
    <div className="fixed inset-0 z-[145] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className={`w-full max-w-md max-h-[88vh] overflow-y-auto rounded-3xl border p-5 shadow-2xl ${darkMode ? "bg-[#092A38] border-[#71CFC2]/30 text-white" : "bg-white border-[#CDEBE7] text-[#113247]"}`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-[#0F8F83] dark:text-[#71CFC2]">My Drugs</p>
            <h2 className="text-2xl font-black leading-tight mt-1">Share or collaborate</h2>
            <p className="text-sm opacity-65 mt-2 truncate">{drug?.name || "Selected monograph"}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className={`grid h-10 w-10 place-items-center rounded-full shrink-0 disabled:opacity-50 ${darkMode ? "bg-white/10 hover:bg-white/15" : "bg-[#E8F8F5] hover:bg-[#DFF7F3]"}`} aria-label="Close sharing modal">
            <X size={19} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <button type="button" onClick={() => setMode?.("share")} disabled={busy} className={`rounded-2xl border p-3 text-left transition disabled:opacity-60 ${mode === "share" ? "border-[#71CFC2] bg-[#71CFC2]/20" : darkMode ? "border-white/10 bg-white/5" : "border-[#DCEDEA] bg-[#F9FCFB]"}`}>
            <Share2 size={18} className="mb-2 text-[#0F8F83]" />
            <span className="block text-sm font-black">Share</span>
            <span className="block text-xs opacity-65 leading-5">Read-only copy/message.</span>
          </button>
          <button type="button" onClick={() => setMode?.("collaborate")} disabled={busy} className={`rounded-2xl border p-3 text-left transition disabled:opacity-60 ${mode === "collaborate" ? "border-[#71CFC2] bg-[#71CFC2]/20" : darkMode ? "border-white/10 bg-white/5" : "border-[#DCEDEA] bg-[#F9FCFB]"}`}>
            <UserPlus size={18} className="mb-2 text-[#0F8F83]" />
            <span className="block text-sm font-black">Collaborate</span>
            <span className="block text-xs opacity-65 leading-5">Invite controlled contribution.</span>
          </button>
        </div>

        <section ref={shareRecipientSectionRef} className={`rounded-2xl border p-4 ${darkMode ? "border-white/10 bg-white/5" : "border-[#DCEDEA] bg-[#F9FCFB]"}`}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="font-black text-sm">Choose colleague</h3>
              <p className="text-xs opacity-60">Only accepted colleagues are shown.</p>
            </div>
            {loading && <Loader2 size={17} className="animate-spin text-[#0F8F83]" />}
          </div>
          <div className={`flex items-center gap-2 rounded-xl px-3 mb-3 ${darkMode ? "bg-black/20" : "bg-white"}`}>
            <Search size={16} className="opacity-50" />
            <input ref={colleagueSearchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search colleagues..." className="w-full bg-transparent py-3 text-sm outline-none" disabled={loading || busy} />
          </div>
          {loading ? <p className="text-sm opacity-65">Loading colleagues...</p> : colleagues.length === 0 ? <p className="rounded-xl bg-[#71CFC2]/10 p-3 text-sm opacity-75">No colleagues are available yet. Add or accept a colleague in Network first.</p> : filteredColleagues.length === 0 ? <p className="text-sm opacity-65">No colleagues match that search.</p> : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {filteredColleagues.map((colleague) => {
                const selected = selectedColleagueId === colleague.id;
                return <button key={colleague.id} type="button" disabled={busy} onClick={() => setSelectedColleagueId(colleague.id)} className={`w-full rounded-xl border p-3 text-left transition disabled:opacity-60 ${selected ? "border-[#71CFC2] bg-[#71CFC2]/20" : darkMode ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-[#DCEDEA] bg-white hover:bg-[#F0F6F5]"}`}><span className="block text-sm font-black">{[colleague.title, colleague.full_name].filter(Boolean).join(" ") || "Colleague"}</span><span className="block text-xs opacity-60">{colleague.practice_name || "VetLearn colleague"}</span></button>;
              })}
            </div>
          )}
        </section>

        <div className="mt-5 flex gap-3 max-[420px]:flex-col">
          <button type="button" onClick={onClose} disabled={busy} className={`flex-1 rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50 ${darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0B3760]"}`}>Cancel</button>
          <button type="button" disabled={!selectedColleagueId || loading || busy} onClick={() => onSubmit?.({ colleagueId: selectedColleagueId, colleague: selectedColleague, mode })} className="flex-1 rounded-2xl bg-[#71CFC2] px-4 py-3 text-sm font-black text-[#062F63] transition disabled:opacity-50">{busy ? "Sending..." : actionLabel}</button>
        </div>
      </div>
    </div>
  );
}
