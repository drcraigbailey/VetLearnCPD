import { useEffect, useRef, useState } from "react";
import { Calculator, ClipboardList, Pill } from "lucide-react";
import AdditionalClinicalCalculators from "../components/AdditionalClinicalCalculators";
import FeatureUnavailable from "../components/FeatureUnavailable";
import PageBanner from "../components/PageBanner";
import PillCounter from "../components/PillCounter";
import { PageToolbar } from "../components/VetLearnUI";
import { canUseFeature, featureKeys } from "../utils/featureAccess";
import ClinicalTools from "./ClinicalTools";
import Protocols from "./Protocols";

export default function ClinicalToolsPage({ user, darkMode = false, featureAccess, adminAccess = false }) {
  const pageRef = useRef(null);
  const [activeSection, setActiveSection] = useState("calculators");
  
  const canUseProtocols = canUseFeature(featureAccess, featureKeys.clinicalProtocols, adminAccess);

  // PERFECTED STRICT ACCESS
  // Ignores leaky fallbacks and guarantees it only shows if the payload explicitly says TRUE
  const canUsePillCount = featureAccess && featureAccess[featureKeys.pillCount] === true;

  // ACCESS PROTECTION
  useEffect(() => {
    if (!canUseProtocols && activeSection === "protocols") {
      setActiveSection("calculators");
    }
    if (!canUsePillCount && activeSection === "pillCounter") {
      setActiveSection("calculators");
    }
  }, [activeSection, canUseProtocols, canUsePillCount]);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return undefined;

    const refreshDoseControls = () => {
      enhanceDoseControls(root, darkMode);
      syncCalculatorTileScrolling(root);
    };
    refreshDoseControls();

    const observer = new MutationObserver(refreshDoseControls);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("input", refreshDoseControls);
    root.addEventListener("change", refreshDoseControls);

    return () => {
      observer.disconnect();
      root.removeEventListener("input", refreshDoseControls);
      root.removeEventListener("change", refreshDoseControls);
    };
  }, [darkMode]);

  const sectionTabs = [
    { id: "calculators", label: "Calculator", icon: Calculator },
    ...(canUsePillCount ? [{ id: "pillCounter", label: "Pill Count", icon: Pill }] : []),
    ...(canUseProtocols ? [{ id: "protocols", label: "Protocols", icon: ClipboardList }] : []),
  ];

  return (
    <div ref={pageRef} className="space-y-6 pb-40">
      <PageBanner
        title="Clinical Tools"
        subtitle="Calculate doses, count tablets and manage clinical protocols."
        darkMode={darkMode}
        badges={[{ label: "Clinical workspace", icon: <Calculator size={14} />, accent: true }]}
      />

      <PageToolbar items={sectionTabs} activeId={activeSection} onChange={setActiveSection} darkMode={darkMode} />

      {activeSection === "calculators" && (
        <>
          <ClinicalTools user={user} darkMode={darkMode} showBanner={false} featureAccess={featureAccess} adminAccess={adminAccess} />
          <AdditionalClinicalCalculators darkMode={darkMode} />
        </>
      )}

      {activeSection === "pillCounter" && (
        canUsePillCount ? (
          <PillCounter darkMode={darkMode} />
        ) : (
          <FeatureUnavailable darkMode={darkMode} title="Pill Count" />
        )
      )}

      {activeSection === "protocols" && (
        canUseProtocols ? (
          <Protocols user={user} darkMode={darkMode} />
        ) : (
          <FeatureUnavailable darkMode={darkMode} title="Clinical Protocols" />
        )
      )}
    </div>
  );
}

function syncCalculatorTileScrolling(root) {
  const calculatorTiles = root.querySelector(".flex.overflow-x-auto.gap-2.pb-2.scrollbar-hide");
  if (!calculatorTiles || !calculatorTiles.querySelector(".lucide-syringe") || !calculatorTiles.querySelector(".lucide-droplets")) return;

  calculatorTiles.querySelectorAll("button").forEach((button) => {
    if (button.dataset.scrollEnhanced === "true") return;
    button.dataset.scrollEnhanced = "true";
    button.addEventListener("click", () => {
      window.setTimeout(() => {
        calculatorTiles.nextElementSibling?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    });
  });
}

function enhanceDoseControls(root, darkMode) {
  root.querySelectorAll('input[type="range"]').forEach((range) => {
    const doseBlock = range.closest(".space-y-2");
    if (!doseBlock?.textContent?.includes("Dose rate")) return;

    const numberInput = doseBlock.querySelector('input[type="number"]');
    if (!numberInput) return;

    const min = Number(range.min || 0);
    const max = Number(range.max || 0);
    if (Number.isFinite(min) && Number.isFinite(max) && max <= min) {
      range.max = String(min > 0 ? min * 2 : 10);
    }

    range.classList.add("touch-pan-y");
    numberInput.setAttribute("inputmode", "decimal");
    numberInput.setAttribute("min", "0");

    const recommendedMax = readRecommendedMax(doseBlock.textContent);
    const enteredDose = Number(numberInput.value || range.value || 0);
    let warning = doseBlock.nextElementSibling?.dataset?.doseWarning === "true" ? doseBlock.nextElementSibling : null;

    if (recommendedMax > 0 && enteredDose > recommendedMax) {
      if (!warning) {
        warning = document.createElement("div");
        warning.dataset.doseWarning = "true";
        doseBlock.insertAdjacentElement("afterend", warning);
      }
      warning.className = `rounded-lg border p-3 flex items-start gap-2 text-sm leading-6 ${darkMode ? "bg-amber-500/10 border-amber-400/20 text-amber-100" : "bg-amber-50 border-amber-200 text-amber-800"}`;
      const warningMessage = `Entered dose is above the recommended maximum of ${formatDoseForWarning(recommendedMax)}.`;
      if (warning.dataset.message !== warningMessage) {
        warning.dataset.message = warningMessage;
        warning.innerHTML = `<span class="font-black">Warning:</span><span>${warningMessage}</span>`;
      }
    } else if (warning) {
      warning.remove();
    }
  });
}

function readRecommendedMax(text) {
  const rangeMatch = String(text || "").match(/Range:\s*([0-9.]+)\s*-\s*([0-9.]+)/i);
  if (rangeMatch) return Number(rangeMatch[2]);

  const singleMatch = String(text || "").match(/Range:\s*([0-9.]+)/i);
  return singleMatch ? Number(singleMatch[1]) : 0;
}

function formatDoseForWarning(value) {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toFixed(3))).replace(/\.0+$/, "");
}