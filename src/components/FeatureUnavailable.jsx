import { Lock } from "lucide-react";
import PageBanner from "./PageBanner";

export default function FeatureUnavailable({ darkMode, title = "Feature unavailable" }) {
  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 text-center"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 text-center shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  return (
    <div className="space-y-5">
      <PageBanner title={title} subtitle="This section is currently turned off for your account or subscription tier." darkMode={darkMode} />
      <section className={panelClass}>
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-[#E8F8F5] text-[#0B3760] grid place-items-center">
          <Lock size={24} />
        </div>
        <h2 className="text-xl font-black mb-2">Access currently disabled</h2>
        <p className="text-sm opacity-70 leading-6">An administrator can enable this again from Admin &gt; Features.</p>
      </section>
    </div>
  );
}