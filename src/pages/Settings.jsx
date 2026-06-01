import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Save, Sparkles, KeyRound } from "lucide-react";
import PageBanner from "../components/PageBanner";

export default function Settings({ darkMode = false }) {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    setAiEnabled(localStorage.getItem("vetlearn-ai-enabled") === "true");
    setApiKey(localStorage.getItem("vetlearn-openai-key") || "");
  }, []);

  const saveSettings = () => {
    localStorage.setItem("vetlearn-ai-enabled", aiEnabled);
    if (apiKey.trim()) {
      localStorage.setItem("vetlearn-openai-key", apiKey.trim());
    } else {
      localStorage.removeItem("vetlearn-openai-key");
    }
    
    window.dispatchEvent(new Event("settingsUpdated"));
    toast.success("Settings saved locally");
  };

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-6 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-6 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  const fieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-4 transition ${
    darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247]"
  }`;

  return (
    <div>
      <PageBanner
        title="Settings"
        subtitle="Manage app preferences, AI features and local configuration."
        darkMode={darkMode}
      />

      <div className={panelClass}>
        <div className="flex items-center gap-3 mb-5">
          <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3`}>
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className={`font-black text-lg ${darkMode ? "text-white" : "text-[#113247]"}`}>
              AI Reflections
            </h2>
            <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
              Configure local AI generation
            </p>
          </div>
        </div>

        <label className="flex items-center gap-3 mb-6 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
            />
            <div className={`block w-14 h-8 rounded-full transition-colors ${aiEnabled ? "bg-[#71CFC2]" : (darkMode ? "bg-slate-600" : "bg-slate-300")}`}></div>
            <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${aiEnabled ? "translate-x-6" : ""}`}></div>
          </div>
          <span className={`font-bold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
            Enable AI Features
          </span>
        </label>

        {aiEnabled && (
          <div className="mb-6 animate-in fade-in slide-in-from-top-2">
            <label className={`block text-sm font-bold mb-2 flex items-center gap-2 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
              <KeyRound size={16} />
              OpenAI API Key
            </label>
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={fieldClass}
            />
            <p className={`text-xs mt-2 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              Your key is stored securely in your browser's local storage and is never sent to our servers.
            </p>
          </div>
        )}

        <button
          onClick={saveSettings}
          className="w-full bg-[#0B3760] text-white rounded-lg p-4 flex justify-center items-center gap-2 font-bold shadow-[0_12px_24px_rgba(11,55,96,0.16)]"
        >
          <Save size={18} />
          Save Settings
        </button>
      </div>
    </div>
  );
}
