import { useState } from "react";
import Dashboard from "./Dashboard";
import FutureReading from "./FutureReading";
import History from "./History";
import Analytics from "./Analytics";
import PageBanner from "../components/PageBanner";

export default function CPD({ user, profile, darkMode, activeReading, onStartReading, onFinishReading, savingReading }) {
  const [activeTab, setActiveTab] = useState("dashboard");

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "future", label: "Future Reads" },
    { id: "history", label: "History" },
    { id: "analytics", label: "Analytics" }
  ];

  return (
    <div>
      <PageBanner
        title="CPD"
        subtitle="Track reading, reflections, future learning and annual progress."
        darkMode={darkMode}
      />

      <div className="cpd-tab-strip flex overflow-x-auto justify-start sm:justify-center gap-2 mb-6 pb-2 scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition shrink-0 ${
              activeTab === tab.id
                ? "bg-[#71CFC2] text-[#062F63] shadow-md"
                : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === "dashboard" && (
          <Dashboard user={user} profile={profile} darkMode={darkMode} activeReading={activeReading} onStartReading={onStartReading} onFinishReading={onFinishReading} savingReading={savingReading} />
        )}
        {activeTab === "future" && <FutureReading user={user} darkMode={darkMode} />}
        {activeTab === "history" && <History user={user} darkMode={darkMode} />}
        {activeTab === "analytics" && <Analytics user={user} darkMode={darkMode} />}
      </div>
    </div>
  );
}