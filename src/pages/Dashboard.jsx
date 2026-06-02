import DashboardCards from "../components/DashboardCards";
import PageBanner from "../components/PageBanner";
import ReadingForm from "../components/ReadingForm";
import { Cloud } from "lucide-react";

export default function Dashboard({ user, profile, darkMode = false, activeReading, onStartReading, onFinishReading, onSaveManualReading, savingReading = false }) {
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || "there").split(" ")[0];

  return (
    <div>
      <PageBanner
        title={`Welcome Back, ${firstName}`}
        subtitle="Your CPD records and future reading are saved to your profile, so they follow you between devices."
        darkMode={darkMode}
        badges={[
          { label: "35 hr target" },
          { label: "Supabase sync", icon: <Cloud size={13} />, accent: true }
        ]}
      />

      <DashboardCards user={user} darkMode={darkMode} />

      <ReadingForm
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
