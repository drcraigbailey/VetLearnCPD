import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";

import {
  BookmarkPlus,
  CalendarDays,
  Check,
  ExternalLink,
  Loader2,
  Trash2
} from "lucide-react";
import HeartbeatLoader from "../components/HeartbeatLoader";

export default function FutureReading({ user, darkMode = false }) {

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const [form, setForm] = useState({
    title: "",
    url: "",
    category: "Medicine",
    priority: "Medium",
    due_date: "",
    notes: ""
  })

  const categories = [
    "Medicine",
    "Surgery",
    "Emergency",
    "Dermatology",
    "Cardiology",
    "Neurology",
    "Other"
  ]

  const priorities = ["High", "Medium", "Low"]

  // Updated to handle dark mode inputs
  const fieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-4 mb-3 transition ${
    darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247]"
  }`

  useEffect(() => {
    loadFutureReading()
  }, [user])

  const loadFutureReading = async () => {
    if (!user) return

    setLoading(true)

    const { data, error } = await supabase
      .from("future_reading")
      .select("*")
      .eq("user_id", user.id)
      .order("status", { ascending: false })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    setItems(data || [])
    setLoading(false)
  }

  const updateForm = (field, value) => {
    setForm({
      ...form,
      [field]: value
    })
  }

  const addItem = async () => {
    if (!user) {
      toast.error("Please sign in first")
      return
    }

    if (!form.title.trim()) {
      toast.error("Add a title first")
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from("future_reading")
      .insert({
        user_id: user.id,
        title: form.title.trim(),
        url: form.url.trim() || null,
        category: form.category,
        priority: form.priority,
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
        status: "planned"
      })

    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    toast.success("Added to future reading")
    setForm({
      title: "",
      url: "",
      category: "Medicine",
      priority: "Medium",
      due_date: "",
      notes: ""
    })
    setSaving(false)
    loadFutureReading()
  }

  const markDone = async (item) => {
    setBusyId(item.id)

    const nextStatus = item.status === "done" ? "planned" : "done"

    const { error } = await supabase
      .from("future_reading")
      .update({ status: nextStatus })
      .eq("id", item.id)
      .eq("user_id", user.id)

    if (error) {
      toast.error(error.message)
      setBusyId(null)
      return
    }

    setItems(items.map(existing =>
      existing.id === item.id
        ? { ...existing, status: nextStatus }
        : existing
    ))

    setBusyId(null)
  }

  const deleteItem = async (id) => {
    setBusyId(id)

    const { error } = await supabase
      .from("future_reading")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      toast.error(error.message)
      setBusyId(null)
      return
    }

    setItems(items.filter(item => item.id !== id))
    toast.success("Removed")
    setBusyId(null)
  }

  const plannedCount = items.filter(item => item.status !== "done").length

  return (
    <div>
      <div className={`relative overflow-hidden bg-gradient-to-br border rounded-lg p-6 mb-6 shadow-[0_18px_45px_rgba(11,55,96,0.08)] ${darkMode ? "from-[#12323A] to-[#0B242B] border-white/10" : "from-white to-[#DFF7F3] border-[#CDEBE7]"}`}>
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          className="absolute -right-8 -bottom-12 w-44 h-44 object-contain opacity-[0.10] pointer-events-none"
        />
        <div className="relative">
          <div className={`w-fit border rounded-full px-3 py-2 text-xs font-bold mb-5 ${darkMode ? "bg-white/10 text-[#71CFC2] border-white/10" : "bg-white text-[#0F8F83] border-[#DCEDEA]"}`}>
            {plannedCount} planned
          </div>
          <h1 className={`text-3xl font-black leading-tight tracking-normal mb-2 ${darkMode ? "text-white" : "text-[#113247]"}`}>
            Future Reading
          </h1>
          <p className={`text-sm leading-6 max-w-[260px] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
            Save papers, links, and ideas before they disappear from your mental waiting room.
          </p>
        </div>
      </div>

      <div className={`border rounded-lg p-5 mb-6 shadow-[0_14px_35px_rgba(11,55,96,0.07)] ${darkMode ? "bg-white/10 border-white/10" : "bg-white/90 border-[#DCEDEA]"}`}>
        <div className="flex items-start gap-3 mb-5">
          <div className={`rounded-lg p-3 ${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
            <BookmarkPlus size={20} />
          </div>
          <div>
            <h2 className={`font-black text-lg ${darkMode ? "text-white" : "text-[#113247]"}`}>
              Add Reading
            </h2>
            <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
              Store useful articles, topics, and CPD links.
            </p>
          </div>
        </div>

        <input
          className={fieldClass}
          placeholder="Title or topic"
          value={form.title}
          onChange={(e) => updateForm("title", e.target.value)}
        />

        <input
          className={fieldClass}
          placeholder="Link or URL"
          value={form.url}
          onChange={(e) => updateForm("url", e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <select
            className={fieldClass}
            value={form.category}
            onChange={(e) => updateForm("category", e.target.value)}
          >
            {categories.map(category => (
              <option key={category} className={darkMode ? "bg-[#071A24] text-white" : ""}>{category}</option>
            ))}
          </select>

          <select
            className={fieldClass}
            value={form.priority}
            onChange={(e) => updateForm("priority", e.target.value)}
          >
            {priorities.map(priority => (
              <option key={priority} className={darkMode ? "bg-[#071A24] text-white" : ""}>{priority}</option>
            ))}
          </select>
        </div>

        <input
          className={fieldClass}
          type="date"
          value={form.due_date}
          onChange={(e) => updateForm("due_date", e.target.value)}
        />

        <textarea
          rows="3"
          className={fieldClass}
          placeholder="Why this is worth reading, or what question it answers..."
          value={form.notes}
          onChange={(e) => updateForm("notes", e.target.value)}
        />

        <button
          className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-4 font-black shadow-[0_12px_24px_rgba(15,143,131,0.16)] disabled:opacity-50 flex items-center justify-center gap-2"
          onClick={addItem}
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <BookmarkPlus size={18} />
              Add to List
            </>
          )}
        </button>
      </div>

      <div className="space-y-3">
        {loading && (
          <div className={`border rounded-lg flex flex-col items-center justify-center py-16 gap-4 ${darkMode ? "bg-white/10 border-white/10 text-slate-300" : "bg-white/80 border-[#DCEDEA] text-slate-500"}`}>
            <HeartbeatLoader size={64} />
            <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2]">Loading Reading List...</p>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className={`border rounded-lg p-5 text-sm ${darkMode ? "bg-white/10 border-white/10 text-slate-300" : "bg-white/80 border-[#DCEDEA] text-slate-500"}`}>
            No future reading saved yet.
          </div>
        )}

        {!loading && items.map(item => (
          <div
            key={item.id}
            className={`border rounded-lg p-5 shadow-[0_10px_24px_rgba(11,55,96,0.06)] ${item.status === "done" ? "opacity-60" : ""} ${darkMode ? "bg-white/10 border-white/10" : "bg-white/90 border-[#DCEDEA]"}`}
          >
            <div className="flex justify-between gap-3">
              <div>
                <div className={`font-black leading-snug ${darkMode ? "text-white" : "text-[#113247]"}`}>
                  {item.title}
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
                    {item.category}
                  </span>
                  <span className={`border rounded-full px-3 py-1 text-xs font-bold ${darkMode ? "bg-white/5 border-white/10 text-slate-300" : "bg-white border-[#DCEDEA] text-slate-600"}`}>
                    {item.priority}
                  </span>
                  {item.due_date && (
                    <span className={`border rounded-full px-3 py-1 text-xs font-bold flex items-center gap-1 ${darkMode ? "bg-white/5 border-white/10 text-slate-300" : "bg-white border-[#DCEDEA] text-slate-600"}`}>
                      <CalendarDays size={13} />
                      {new Date(item.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => markDone(item)}
                className={`h-10 w-10 shrink-0 rounded-full grid place-items-center transition-colors ${
                  item.status === "done"
                    ? (darkMode ? "bg-[#71CFC2] text-[#071A24]" : "bg-[#0F8F83] text-white")
                    : (darkMode ? "bg-white/10 text-slate-300 hover:text-white" : "bg-[#E8F8F5] text-[#0B3760] hover:bg-[#d4f1ec]")
                }`}
              >
                {busyId === item.id ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
              </button>
            </div>

            {item.notes && (
              <p className={`text-sm leading-6 mt-3 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                {item.notes}
              </p>
            )}

            <div className="flex justify-end gap-3 mt-4">
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`rounded-lg px-3 py-2 text-sm font-bold flex items-center gap-2 ${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"}`}
                >
                  <ExternalLink size={16} />
                  Open
                </a>
              )}

              <button
                onClick={() => deleteItem(item.id)}
                className={`rounded-lg px-3 py-2 text-sm font-bold flex items-center gap-2 ${darkMode ? "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-black"}`}
              >
                {busyId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}