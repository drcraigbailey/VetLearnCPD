import { useState, useEffect } from "react";
import { generateReflection } from "../utils/aiReflection";
import toast from "react-hot-toast";

import {
  Loader2,
  Check,
  Sparkles,
  Cloud,
  FileText,
  Search,
  Clock3,
  PencilLine
} from "lucide-react";

export default function ReadingForm({ darkMode = false, activeReading, onStartReading, onFinishReading, onSaveManualReading, savingReading = false }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("Medicine");
  const [template, setTemplate] = useState("rcvs");
  const [entryMode, setEntryMode] = useState("timer");
  const [manualMinutes, setManualMinutes] = useState("");

  const [notes, setNotes] = useState("");
  const [reflection, setReflection] = useState("");

  const [generating, setGenerating] = useState(false);
  const [fetchingTitle, setFetchingTitle] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    const checkAiStatus = () => {
      setAiEnabled(localStorage.getItem("vetlearn-ai-enabled") === "true");
    };

    checkAiStatus();
    window.addEventListener("settingsUpdated", checkAiStatus);
    return () => window.removeEventListener("settingsUpdated", checkAiStatus);
  }, []);

  const categories = [
    "Medicine",
    "Surgery",
    "Emergency",
    "Dermatology",
    "Cardiology",
    "Neurology"
  ];

  const templates = {
    rcvs: `What did I learn?\n\nHow is this relevant to my clinical work or professional role?\n\nWhat will I change, consider, or do differently as a result?\n\nWhat further learning or follow-up is needed?`,
    clinical: `Clinical question:\n\nKey evidence or learning points:\n\nHow I will apply this in practice:\n\nRisks, limitations, or cases where this may not apply:`,
    quick: `Key learning:\n\nPractical takeaway:\n\nFollow-up action:`
  };

  const fieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-4 mb-3 transition ${darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247]"}`;
  const compactFieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-4 transition ${darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247]"}`;

  const extractPubmedId = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const pubmedMatch = trimmed.match(/pubmed(?:\.ncbi\.nlm\.nih\.gov)?\/?(\d+)/i);
    if (pubmedMatch?.[1]) return pubmedMatch[1];
    const ncbiMatch = trimmed.match(/[?&]id=(\d+)/i);
    if (trimmed.toLowerCase().includes("pubmed") && ncbiMatch?.[1]) return ncbiMatch[1];
    if (/^\d{6,10}$/.test(trimmed)) return trimmed;
    return null;
  };

  const getPubmedTitle = async (value = url) => {
    try {
      const id = extractPubmedId(value);
      if (!id) return;
      setFetchingTitle(true);
      const response = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${id}&retmode=json`);
      const data = await response.json();
      const article = data.result[id];
      if (article?.title) {
        setTitle(article.title);
        toast.success("PubMed title loaded");
      } else {
        toast.error("No PubMed title found");
      }
    } catch (error) {
      toast.error("PubMed lookup failed");
      console.log("PubMed error:", error);
    } finally {
      setFetchingTitle(false);
    }
  };

  const applyTemplate = () => {
    const next = templates[template];
    if (reflection.trim()) {
      setReflection(`${reflection.trim()}\n\n${next}`);
    } else {
      setReflection(next);
    }
    toast.success("Reflection template added");
  };

  const buildReadingPayload = () => ({ title, url, category, notes, reflection });

  const resetForm = () => {
    setTitle("");
    setUrl("");
    setNotes("");
    setReflection("");
    setCategory("Medicine");
    setManualMinutes("");
  };

  const validateManualMinutes = () => {
    const minutes = Number(manualMinutes);
    if (!manualMinutes || !Number.isFinite(minutes)) {
      toast.error("Enter reading time in minutes");
      return null;
    }
    if (minutes <= 0) {
      toast.error("Reading time must be more than 0 minutes");
      return null;
    }
    if (minutes > 720) {
      toast.error("Please split readings longer than 12 hours into separate CPD entries");
      return null;
    }
    return Math.round(minutes);
  };

  const startReading = () => {
    onStartReading?.(buildReadingPayload());
  };

  const finishReading = async () => {
    const saved = await onFinishReading?.(buildReadingPayload());
    if (!saved) return;
    resetForm();
  };

  const saveManualReading = async () => {
    const minutes = validateManualMinutes();
    if (!minutes) return;
    const saved = await onSaveManualReading?.({ ...buildReadingPayload(), duration_minutes: minutes });
    if (!saved) return;
    resetForm();
  };

  const generateAI = async () => {
    if (!title) {
      toast.error("Enter article title first");
      return;
    }
    setGenerating(true);
    toast.loading("Generating reflection...", { id: "ai" });
    const result = await generateReflection(title, category, notes, reflection);
    setReflection(result);
    setGenerating(false);
    toast.success("Reflection generated", { id: "ai" });
  };

  return (
    <div className={`${darkMode ? "bg-white/10 border-white/10" : "bg-white/90 border-[#DCEDEA]"} border rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]`}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className={`font-black text-lg ${darkMode ? "text-white" : "text-[#113247]"}`}>New Reading</h2>
          <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-500"}`}>Track articles and generate reflections</p>
        </div>
        <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-full px-3 py-2 text-xs font-bold flex items-center gap-1 shrink-0`}>
          <Cloud size={14} />
          Cloud sync
        </div>
      </div>

      {!activeReading && (
        <div className={`grid grid-cols-2 gap-2 mb-4 rounded-lg p-1 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
          <button
            type="button"
            onClick={() => setEntryMode("timer")}
            className={`rounded-md p-3 text-sm font-black flex items-center justify-center gap-2 ${entryMode === "timer" ? "bg-[#71CFC2] text-[#062F63] shadow-sm" : darkMode ? "text-slate-300" : "text-[#0B3760]"}`}
          >
            <Clock3 size={16} /> Timer
          </button>
          <button
            type="button"
            onClick={() => setEntryMode("manual")}
            className={`rounded-md p-3 text-sm font-black flex items-center justify-center gap-2 ${entryMode === "manual" ? "bg-[#71CFC2] text-[#062F63] shadow-sm" : darkMode ? "text-slate-300" : "text-[#0B3760]"}`}
          >
            <PencilLine size={16} /> Manual
          </button>
        </div>
      )}

      <input className={fieldClass} placeholder="Article title" value={title} onChange={(e) => setTitle(e.target.value)} />

      <div className="flex gap-2 mb-3">
        <input className={compactFieldClass} placeholder="PubMed link, PMID, or article URL" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => getPubmedTitle(url)} />
        <button className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} w-14 rounded-lg grid place-items-center shrink-0`} onClick={() => getPubmedTitle(url)} disabled={fetchingTitle} aria-label="Fetch PubMed title">
          {fetchingTitle ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
        </button>
      </div>

      <select className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value)}>
        {categories.map(cat => (<option key={cat}>{cat}</option>))}
      </select>

      {entryMode === "manual" && !activeReading && (
        <div>
          <input
            className={fieldClass}
            type="number"
            min="1"
            max="720"
            step="1"
            placeholder="Reading time in minutes"
            value={manualMinutes}
            onChange={(e) => setManualMinutes(e.target.value)}
          />
          <p className={`-mt-1 mb-3 text-xs leading-5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            Manual CPD time is saved as a manual entry. Use 1 to 720 minutes.
          </p>
        </div>
      )}

      <textarea rows="3" placeholder="Key learning points or notes..." className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="grid grid-cols-[1fr_auto] gap-2 mb-3">
        <select className={compactFieldClass} value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="rcvs">RCVS-style reflection</option>
          <option value="clinical">Clinical case reflection</option>
          <option value="quick">Quick CPD note</option>
        </select>
        <button className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg px-4 font-bold grid place-items-center`} onClick={applyTemplate} aria-label="Add reflection template">
          <FileText size={18} />
        </button>
      </div>

      {aiEnabled && (
        <button
          onClick={generateAI}
          disabled={generating}
          className="w-full bg-[#0B3760] text-white rounded-lg p-4 mb-4 flex justify-center items-center gap-2 disabled:opacity-50 font-bold shadow-[0_12px_24px_rgba(11,55,96,0.16)]"
        >
          {generating ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Generate AI Reflection
            </>
          )}
        </button>
      )}

      <textarea rows="7" placeholder="Write your own reflection or edit AI-generated reflection..." className={fieldClass} value={reflection} onChange={(e) => setReflection(e.target.value)} />

      {activeReading && (
        <div className={`${darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0B3760]"} mb-4 rounded-lg p-3 text-sm font-bold`}>
          Active timer: {activeReading.title}
        </div>
      )}

      {!activeReading ? (
        entryMode === "timer" ? (
          <button className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-4 font-black shadow-[0_12px_24px_rgba(15,143,131,0.16)]" onClick={startReading}>
            Start Reading
          </button>
        ) : (
          <button disabled={savingReading} className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-4 font-black shadow-[0_12px_24px_rgba(15,143,131,0.16)] flex justify-center items-center gap-2 disabled:opacity-50" onClick={saveManualReading}>
            {savingReading ? <><Loader2 className="animate-spin" size={18} />Saving...</> : <><PencilLine size={18} />Save Manual Reading</>}
          </button>
        )
      ) : (
        <button disabled={savingReading} onClick={finishReading} className="w-full bg-[#0F8F83] text-white rounded-lg p-4 flex justify-center items-center gap-2 font-bold">
          {savingReading ? <><Loader2 className="animate-spin" size={18} />Saving...</> : <><Check size={18} />Finish + Save</>}
        </button>
      )}
    </div>
  );
}
