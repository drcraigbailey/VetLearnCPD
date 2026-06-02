import { useCallback, useState } from "react";
import { Calculator } from "lucide-react";
import PageBanner from "../components/PageBanner";
import ProtocolContextSelector from "../components/ProtocolContextSelector";
import ClinicalTools from "./ClinicalTools";

export default function ClinicalToolsPage({ user, darkMode = false }) {
  const [protocolContext, setProtocolContext] = useState(null);
  const handleProtocolChange = useCallback((nextProtocol) => setProtocolContext(nextProtocol), []);

  return (
    <div className="space-y-6">
      <PageBanner
        title="Clinical Tools"
        subtitle="Calculate doses, CRIs, fluids, transfusions and toxicology guidance."
        darkMode={darkMode}
        badges={[{ label: "Clinical calculators", icon: <Calculator size={14} />, accent: true }]}
      />
      <ProtocolContextSelector user={user} darkMode={darkMode} onProtocolChange={handleProtocolChange} />
      <ClinicalTools user={user} darkMode={darkMode} showBanner={false} protocolContext={protocolContext} />
    </div>
  );
}
