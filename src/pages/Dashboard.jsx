import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardCards from "../components/DashboardCards";
import PageBanner from "../components/PageBanner";
import ReadingForm from "../components/ReadingForm";
import { Target } from "lucide-react";
import { supabase } from "../supabaseClient";

const DEFAULT_CPD_TARGET_HOURS = 35;

export default function Dashboard({ user, profile, darkMode = false, activeReading, onStartReading, onFinishReading, onSaveManualReading, savingReading = false }) {
  const navigate = useNavigate();
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || "there").split(" ")[0];
  const [cpdTargetHours, setCpdTargetHours] = useState(DEFAULT_CPD_TARGET_HOURS);

  useEffect(() => {
    if (!user?.id) return;

    const loadTarget = async () => {
      const { data } = await supabase
        .from("user_preferences")
        .select("app_preferences")
        .eq("user_id", user.id)
        .maybeSingle();

      const savedTarget = Number(data?.app_preferences?.cpdTargetHours ?? data?.app_preferences?.cpd_target_hours ?? DEFAULT_CPD_TARGET_HOURS);
      setCpdTargetHours(Number.isFinite(savedTarget) && savedTarget > 0 ? savedTarget : DEFAULT_CPD_TARGET_HOURS);
    };

    loadTarget();

    const handleSettingsUpdate = () => loadTarget();
    window.addEventListener("settingsUpdated", handleSettingsUpdate);
    return () => window.removeEventListener("settingsUpdated", handleSettingsUpdate);
  }, [user?.id]);

  const openCpdTargetSetting = () => {
    navigate("/settings#cpd-target", { state: { scrollTo: "cpd-target" } });
  };

  return (
    <div>
      <PageBanner
        title={`Welcome Back, ${firstName}`}
        subtitle="Your CPD records and future reading are saved to your profile, so they follow you between devices."
        darkMode={darkMode}
        badges={[
          { label: `${cpdTargetHours:g} hr target`.replace(":g", "") }
        ]}
      />

      <button
        type="button"
        onClick={openCpdTargetSetting}
        className={`mb-5 w-full rounded-lg border p-4 text-left transition flex items-center gap-3 ${
          darkMode
            ? "bg-white/10 border-white/10 text-slate-100 hover:bg-white/15"
            : "bg-white/90 border-[#DCEDEA] text-[#0B3760] hover:bg-[#E8F8F5] shadow-[0_12px_30px_rgba(11,55,96,0.06)]"
        }`}
      >
        <span className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0F8F83]"} h-11 w-11 rounded-lg grid place-items-center shrink-0`}>
          <Target size={20} />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-black uppercase tracking-widest opacity-60">CPD Target</span>
          <span className="block text-xl font-black">Target: {cpdTargetHours} hrs</span>
        </span>
      </button>

      <DashboardCards user={user} darkMode={darkMode} />

      <ReadingForm
        user={user}
        darkMode={darkMode}
        activeReading={activeReading}
        onStartReading={onStartReading}
        onFinishReading={onFinishReading}
        onSaveManualReading={onSaveManualReading}
        savingReading={savingReading}
      />
    </div>
  );
}
