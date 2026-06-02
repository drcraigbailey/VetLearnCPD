import ProtocolContextSelector from "../components/ProtocolContextSelector";
import ClinicalTools from "./ClinicalTools";

export default function ClinicalToolsPage({ user, darkMode = false }) {
  return (
    <div className="space-y-6">
      <ClinicalTools user={user} darkMode={darkMode} />
      <ProtocolContextSelector user={user} darkMode={darkMode} />
    </div>
  );
}
