import { Calculator } from "lucide-react";
import PageBanner from "../components/PageBanner";
import ProtocolContextSelector from "../components/ProtocolContextSelector";
import ClinicalTools from "./ClinicalTools";

export default function ClinicalToolsPage({ user, darkMode = false }) {
  return (
    <div className="space-y-6">
      <PageBanner
        title="Clinical Tools"
        subtitle="Calculate doses, CRIs, fluids, transfusions and toxicology guidance."
        darkMode={darkMode}
        badges={[{ label: "Clinical calculators", icon: <Calculator size={14} />, accent: true }]}
      />
      <ProtocolContextSelector user={user} darkMode={darkMode} />
      <ClinicalTools user={user} darkMode={darkMode} showBanner={false} />
    </div>
  );
}
