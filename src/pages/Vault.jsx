import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import LoadingState from "../components/LoadingState";
import PageBanner from "../components/PageBanner";
import AppPopup, { popupPresets } from "../components/AppPopup";
import { supabase } from "../supabaseClient";

const categories = ["Veterinary Platforms", "CPD Providers", "Government Services", "Finance", "Insurance", "Personal", "Custom"];
const emptyForm = { platform_name: "", website_url: "", username: "", password_value: "", notes: "", category: "Veterinary Platforms" };

export default function Vault({ user, darkMode }) {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [appPopup, setAppPopup] = useState(null);
  const formRef = useRef(null);

  const closeAppPopup = () => setAppPopup(null);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";
  const fieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247] placeholder:text-slate-500"}`;
  const quietButtonClass = darkMode
    ? "bg-white/10 text-slate-100 hover:bg-white/15"
    : "bg-[#E8F8F5] text-[#0B3760] hover:bg-[#DDF5F1]";
  const dangerButtonClass = darkMode
    ? "bg-transparent text-red-400 hover:bg-red-500/10"
    : "bg-transparent text-red-600 hover:bg-red-50";

  useEffect(() => {
    if (user) loadEntries();
  }, [user]);

  const loadEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("vault_entries").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (error) toast.error("Could not load Vault");
    else setEntries(data || []);
    setLoading(false);
  };

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const scrollToForm = () => {
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(false);
  };

  const openNewEntry = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
    scrollToForm();
  };

  const saveEntry = async () => {
    if (!form.platform_name.trim()) return toast.error("Add a platform name");
    setSaving(true);

    const payload = {
      user_id: user.id,
      platform_name: form.platform_name.trim(),
      website_url: form.website_url.trim() || null,
      username: form.username.trim() || null,
      password_value: form.password_value || null,
      notes: form.notes.trim() || null,
      category: form.category,
      updated_at: new Date().toISOString()
    };

    const result = editingId
      ? await supabase.from("vault_entries").update(payload).eq("id", editingId).eq("user_id", user.id).select().single()
      : await supabase.from("vault_entries").insert(payload).select().single();

    if (result.error) toast.error("Could not save Vault entry");
    else {
      toast.success(editingId ? "Vault entry updated" : "Saved to Vault");
      resetForm();
      loadEntries();
    }
    setSaving(false);
  };

  const editEntry = (entry) => {
    setEditingId(entry.id);
    setForm({
      platform_name: entry.platform_name || "",
      website_url: entry.website_url || "",
      username: entry.username || "",
      password_value: entry.password_value || "",
      notes: entry.notes || "",
      category: entry.category || "Custom"
    });
    setFormOpen(true);
    scrollToForm();
  };

  const requestDeleteEntry = (entry) => {
    setAppPopup(popupPresets.deleteVaultEntry({
      platformName: entry.platform_name,
      onPrimary: () => {
        closeAppPopup();
        deleteEntry(entry.id);
      },
      onSecondary: closeAppPopup
    }));
  };

  const deleteEntry = async (id) => {
    const { error } = await supabase.from("vault_entries").delete().eq("id", id).eq("user_id", user.id);
    if (error) toast.error("Could not delete entry");
    else {
      setEntries(prev => prev.filter(entry => entry.id !== id));
      toast.success("Vault entry deleted");
    }
  };

  const copyText = async (text, label) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const filteredEntries = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return entries.filter(entry => {
      const matchesCategory = categoryFilter === "All" || entry.category === categoryFilter;
      const matchesSearch = !query || [entry.platform_name, entry.website_url, entry.username, entry.category].some(value => value?.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [categoryFilter, entries, searchQuery]);

  return (
    <div className="pb-8 space-y-5">
      <PageBanner title="Vault" subtitle="Securely store credentials, API keys, licence keys and notes for professional platforms." darkMode={darkMode} />

      <section className={panelClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div>
            <h2 className="text-lg font-black">Stored Entries</h2>
            <p className="text-sm opacity-60 leading-6">Search and manage your saved credentials.</p>
          </div>
          <button onClick={openNewEntry} className="rounded-lg bg-[#71CFC2] text-[#062F63] px-4 py-3 text-sm font-black flex items-center justify-center gap-2 shrink-0">
            <Plus size={18} /> Add new entry
          </button>
        </div>

        <div className={`rounded-lg p-3 ${darkMode ? "bg-black/10" : "bg-[#F0F6F5]"}`}>
          <div className="flex items-center gap-2">
            <Search size={18} className="opacity-50" />
            <input className="bg-transparent outline-none flex-1 text-sm min-w-0" placeholder="Search platform, website, username or category..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {["All", ...categories].map(category => (
            <button key={category} onClick={() => setCategoryFilter(category)} className={`px-3 py-2 rounded-lg text-xs font-black transition ${categoryFilter === category ? "bg-[#71CFC2] text-[#062F63] shadow-md" : quietButtonClass}`}>{category}</button>
          ))}
        </div>
      </section>

      {formOpen && (
        <section ref={formRef} className={`${panelClass} scroll-mt-28`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-black">{editingId ? "Edit Vault Entry" : "Add New Entry"}</h2>
              <p className="text-sm opacity-60 leading-6">Save platform credentials and notes in your private Vault.</p>
            </div>
            <button onClick={resetForm} className={`p-2 rounded-lg ${quietButtonClass}`} aria-label="Close entry form"><X size={18} /></button>
          </div>
          <div className="grid gap-3">
            <input className={fieldClass} placeholder="Platform name" value={form.platform_name} onChange={(e) => updateForm("platform_name", e.target.value)} />
            <input className={fieldClass} placeholder="Website URL" value={form.website_url} onChange={(e) => updateForm("website_url", e.target.value)} />
            <input className={fieldClass} placeholder="Username" value={form.username} onChange={(e) => updateForm("username", e.target.value)} />
            <input className={fieldClass} type="password" placeholder="Password / API key / licence key" value={form.password_value} onChange={(e) => updateForm("password_value", e.target.value)} />
            <select className={fieldClass} value={form.category} onChange={(e) => updateForm("category", e.target.value)}>
              {categories.map(category => <option key={category}>{category}</option>)}
            </select>
            <textarea className={fieldClass} rows="3" placeholder="Notes" value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={resetForm} disabled={saving} className={`rounded-lg p-3 text-sm font-black ${quietButtonClass}`}>Cancel</button>
              <button onClick={saveEntry} disabled={saving} className="bg-[#71CFC2] text-[#062F63] rounded-lg p-3 font-black flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                {editingId ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </section>
      )}

      {loading ? <section className={panelClass}><LoadingState label="Loading Vault..." darkMode={darkMode} /></section> : filteredEntries.length === 0 ? (
        <section className={panelClass}>
          <div className="flex items-start gap-3">
            <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3 shrink-0`}><KeyRound size={18} /></div>
            <div>
              <h3 className="font-black">No Vault entries found</h3>
              <p className="text-sm opacity-60 leading-6">Add a new entry or change your search/filter.</p>
            </div>
          </div>
        </section>
      ) : filteredEntries.map(entry => {
        const visible = visiblePasswords[entry.id];
        return (
          <section key={entry.id} className={panelClass}>
            <div className="flex justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h3 className="font-black text-lg truncate">{entry.platform_name}</h3>
                <p className="text-xs opacity-60">{entry.category} | Updated {new Date(entry.updated_at || entry.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => editEntry(entry)} className={`p-2 rounded-lg ${quietButtonClass}`} aria-label="Edit"><Pencil size={16} /></button>
                <button onClick={() => requestDeleteEntry(entry)} className={`p-2 rounded-lg ${dangerButtonClass}`} aria-label="Delete"><Trash2 size={16} /></button>
              </div>
            </div>

            {entry.website_url && <a className="text-sm font-bold text-[#0F8F83] break-all" href={entry.website_url} target="_blank" rel="noreferrer">{entry.website_url}</a>}
            <CredentialRow label="Username" value={entry.username} onCopy={() => copyText(entry.username, "Username")} buttonClass={quietButtonClass} />
            <div className="flex items-center justify-between gap-3 py-2 border-t border-black/5 dark:border-white/10">
              <div className="min-w-0">
                <div className="text-xs opacity-50 font-bold uppercase">Password / Key</div>
                <div className="font-mono text-sm truncate">{visible ? entry.password_value || "-" : entry.password_value ? "••••••••••••" : "-"}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setVisiblePasswords(prev => ({ ...prev, [entry.id]: !visible }))} className={`p-2 rounded-lg ${quietButtonClass}`}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                <button onClick={() => copyText(entry.password_value, "Password")} className={`p-2 rounded-lg ${quietButtonClass}`}><Copy size={16} /></button>
              </div>
            </div>
            {entry.notes && <p className="text-sm opacity-75 mt-2 whitespace-pre-wrap">{entry.notes}</p>}
          </section>
        );
      })}

      <AppPopup
        open={!!appPopup}
        onClose={closeAppPopup}
        darkMode={darkMode}
        onSecondary={closeAppPopup}
        {...(appPopup || {})}
      />
    </div>
  );
}

function CredentialRow({ label, value, onCopy, buttonClass }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-t border-black/5 dark:border-white/10">
      <div className="min-w-0">
        <div className="text-xs opacity-50 font-bold uppercase">{label}</div>
        <div className="text-sm truncate">{value || "-"}</div>
      </div>
      <button onClick={onCopy} className={`p-2 rounded-lg ${buttonClass}`}><Copy size={16} /></button>
    </div>
  );
}
