import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Activity,
  AlertTriangle,
  Beaker,
  Calculator,
  ClipboardList,
  Clock,
  Droplets,
  HeartPulse,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  Syringe,
  AlertOctagon,
  Pill,
  WifiOff,
  X,
  Loader2
} from "lucide-react";
import PageBanner from "../components/PageBanner";
import HeartbeatLoader from "../components/HeartbeatLoader";
import ProtocolContextSelector from "../components/ProtocolContextSelector";
import useOnlineStatus from "../hooks/useOnlineStatus";
import {
  cacheCalculatorData,
  cacheLocalCalculation,
  calculatorDataTypes,
  getCachedCalculatorData,
  getLastCalculatorCacheUpdate,
  getLocalCalculationHistory,
  getOfflineDoseRows,
  getOfflineDrugOptions,
  getOfflineInteractions,
  mergeCalculatorData
} from "../services/calculatorDataService";
import { supabase } from "../supabaseClient";
import { drugService } from "../services/drugService";
import { canUseFeature, featureKeys } from "../utils/featureAccess";
import { exportCalculationHistoryPdf } from "../utils/calculationHistoryPdf";

// Renamed "Pill Counter" to "Pill Count" everywhere to match exact wording requirements
const tabs = [
  { id: "drug", label: "Main Calculator", icon: Calculator },
  { id: "protocol", label: "Protocol Calculator", icon: ClipboardList },
  { id: "emergency", label: "Emergency Drugs", icon: Syringe },
  { id: "fluids", label: "Fluid Therapy", icon: Droplets },
  { id: "transfusion", label: "Blood Transfusion", icon: HeartPulse },
  { id: "cri", label: "CRI Calculator", icon: Activity },
  { id: "toxicology", label: "Toxicology", icon: ShieldAlert },
  { id: "interaction", label: "Interaction Checker", icon: AlertOctagon },
  { id: "pill_counter", label: "Pill Count", icon: Pill }
];

const speciesOptions = ["Dog", "Cat", "Rabbit", "Horse", "Other"];

const panelClass = (darkMode) =>
  darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

const fieldClass = (darkMode) =>
  `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${
    darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247] placeholder:text-slate-500"
  }`;

const normalise = (value) => String(value || "").toLowerCase().trim();

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatNumber = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
};

const uniqueValues = (values = []) => [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];

const compactResultText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const calculatorDataConfig = [
  { stateKey: "drugCalculators", cacheType: calculatorDataTypes.drugCalculators, table: "drug_calculators", order: "drug_name" },
  { stateKey: "criProtocols", cacheType: calculatorDataTypes.criProtocols, table: "cri_protocols", order: "drug_name" },
  { stateKey: "emergencyDrugs", cacheType: calculatorDataTypes.emergencyDrugs, table: "emergency_drug_calculator", order: "drug_name" },
  { stateKey: "fluidCalculators", cacheType: calculatorDataTypes.fluidCalculators, table: "fluid_calculators", order: "calculation_name" },
  { stateKey: "transfusionCalculators", cacheType: calculatorDataTypes.transfusionCalculators, table: "transfusion_calculators", order: "species" },
  { stateKey: "toxicities", cacheType: calculatorDataTypes.toxicities, table: "species_toxicities", order: "toxin" }
];

const emptyCalculatorData = Object.fromEntries(calculatorDataConfig.map(({ stateKey }) => [stateKey, []]));

const mergeRows = (...groups) => {
  const rows = new Map();
  groups.flat().filter(Boolean).forEach((row) => {
    const semanticKey = [
      normalise(row.drug_name || row.name || row.calculation_name || row.toxin),
      normalise(row.species),
      normalise(row.route),
      normalise(row.indication),
      String(row.concentration || ""),
      String(row.min_dose ?? row.dose_min ?? ""),
      String(row.max_dose ?? row.dose_max ?? "")
    ].join("|");
    const key = semanticKey.replace(/\|/g, "") ? semanticKey : String(row.id);
    rows.set(key, row);
  });
  return Array.from(rows.values());
};

const latestDate = (values) => values.filter(Boolean).reduce((latest, value) => (
  !latest || Date.parse(value) > Date.parse(latest) ? value : latest
), null);

const buildDoseSummary = ({ name, route, doseLabel, concentrationLabel, result, guidance }) => ({
  name: name || "Selected drug",
  route: route || "Route not recorded",
  doseLabel: doseLabel || "",
  concentrationLabel: concentrationLabel || "",
  result: compactResultText(result),
  guidance: guidance || ""
});

const filterInteractionWarningsForDrugNames = (interactions, names) => {
  const selected = new Set(names.map(normalise));
  return (interactions || []).filter((warning) => (
    selected.has(normalise(warning.drug_name))
    && selected.has(normalise(warning.interacting_drug))
  ));
};

const fetchInteractionWarningsForDrugNames = async (names = [], { isOnline = true, cachedInteractions = [] } = {}) => {
  const searchNames = uniqueValues(names)
    .map((name) => name.replace(/[,%]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (searchNames.length < 2) return [];
  const cachedMatches = filterInteractionWarningsForDrugNames(cachedInteractions, searchNames);
  if (!isOnline) return cachedMatches;

  const orConditions = [];
  for (let i = 0; i < searchNames.length; i += 1) {
    for (let j = i + 1; j < searchNames.length; j += 1) {
      const nameA = searchNames[i];
      const nameB = searchNames[j];
      orConditions.push(`and(drug_name.ilike.%${nameA}%,interacting_drug.ilike.%${nameB}%)`);
      orConditions.push(`and(drug_name.ilike.%${nameB}%,interacting_drug.ilike.%${nameA}%)`);
    }
  }

  if (!orConditions.length) return [];
  const { data, error } = await supabase.from("drug_interactions").select("*").or(orConditions.join(","));
  if (error) return cachedMatches;
  await mergeCalculatorData(calculatorDataTypes.interactions, data || []);

  const seen = new Set();
  return (data || []).filter((warning) => {
    const key = warning.id || [
      normalise(warning.drug_name),
      normalise(warning.interacting_drug),
      normalise(warning.interaction || warning.mechanism || warning.recommendation || warning.notes)
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const firstBySpecies = (rows, species) => rows.find((row) => row.species === species) || rows[0] || null;
const doseMapFrom = (context) => context?.doseMap || context?.protocol?.drug_doses || {};
const hasCompleteDoseData = (row) => Boolean(
  row
  && row.species
  && (numberValue(row.min_dose ?? row.dose_min, NaN) > 0 || numberValue(row.max_dose ?? row.dose_max, NaN) > 0)
  && row.dose_unit
  && numberValue(row.concentration, 0) > 0
);

const missingDoseFields = (row) => [
  !row?.species ? "species" : null,
  !(numberValue(row?.min_dose ?? row?.dose_min, NaN) > 0 || numberValue(row?.max_dose ?? row?.dose_max, NaN) > 0) ? "dose" : null,
  !row?.dose_unit ? "dose unit" : null,
  !(numberValue(row?.concentration, 0) > 0) ? "concentration" : null
].filter(Boolean);

const formatCacheDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

export default function ClinicalTools({ user, darkMode = false, showBanner = true, featureAccess, adminAccess = false, initialTab = "drug" }) {
  const isOnline = useOnlineStatus();
  const appliedInitialTabRef = useRef(initialTab || "drug");
  const [activeTab, setActiveTab] = useState(initialTab || "drug");
  const [protocolContext, setProtocolContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(emptyCalculatorData);
  const [offlineDrugOptions, setOfflineDrugOptions] = useState([]);
  const [offlineInteractions, setOfflineInteractions] = useState([]);
  const [cacheStatus, setCacheStatus] = useState({ usingCache: false, lastUpdated: null });

  // STRICT ACCESS CONTROL: Safely deeply evaluates feature matrices to hide tabs 
  // without breaking the app if user records lack the new database keys yet.
  const visibleTabs = useMemo(() => {
    return tabs.filter((tab) => {
      if (["drug", "protocol", "interaction"].includes(tab.id)) {
        return canUseFeature(featureAccess, featureKeys.drugCalculator, adminAccess);
      }
      
      if (tab.id === "pill_counter") {
        if (adminAccess) return true; // Admins always get bypass access

        // Deep evaluation of the object/array avoiding reliance on the `canUseFeature` blackbox fallback
        if (Array.isArray(featureAccess)) {
          const match = featureAccess.find(f => (f.feature_key || f.key) === "pill_counter");
          if (match) return match.is_enabled === true;
        } else if (featureAccess && typeof featureAccess === "object") {
          if (featureAccess["pill_counter"] !== undefined) {
            return featureAccess["pill_counter"] === true;
          }
        }
        
        // Final ultimate fallback in case of context structure differences
        return canUseFeature(featureAccess, "pill_counter", adminAccess);
      }
      
      // Keep remaining tools
      return true;
    });
  }, [featureAccess, adminAccess]);

  useEffect(() => {
    const nextInitialTab = initialTab || "drug";
    if (appliedInitialTabRef.current === nextInitialTab) return;

    appliedInitialTabRef.current = nextInitialTab;
    setActiveTab(nextInitialTab);
  }, [initialTab]);

  // ACCESS PROTECTION: Intercepts users deep-linking to / trying to navigate to disabled tabs
  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      // Redirects them to the primary "Calculator" tab if they shouldn't be here
      setActiveTab(visibleTabs[0]?.id || "drug"); 
    }
  }, [activeTab, visibleTabs]);

  const loadClinicalTools = async () => {
    setLoading(true);
    try {
      const [cachedEntries, offlineDoses, cachedDrugOptions, cachedInteractions, cacheDates] = await Promise.all([
        Promise.all(calculatorDataConfig.map(({ cacheType }) => getCachedCalculatorData(cacheType))),
        getOfflineDoseRows(),
        getOfflineDrugOptions(),
        getOfflineInteractions(),
        Promise.all(calculatorDataConfig.map(({ cacheType }) => getLastCalculatorCacheUpdate(cacheType)))
      ]);
      const cachedData = Object.fromEntries(calculatorDataConfig.map(({ stateKey }, index) => [stateKey, cachedEntries[index] || []]));
      cachedData.drugCalculators = mergeRows(cachedData.drugCalculators, offlineDoses);
      setData(cachedData);
      setOfflineDrugOptions(cachedDrugOptions);
      setOfflineInteractions(cachedInteractions);
      const offlineDoseDates = offlineDoses.map((row) => row.offline_updated_at).filter(Boolean);
      setCacheStatus({ usingCache: !isOnline, lastUpdated: latestDate([...cacheDates, ...offlineDoseDates]) });

      if (!isOnline) return;

      const remoteResults = await Promise.all(calculatorDataConfig.map(({ table, order }) => (
        supabase.from(table).select("*").order(order)
      )));
      const nextData = { ...cachedData };
      let usedFallback = false;

      await Promise.all(remoteResults.map(async (result, index) => {
        const config = calculatorDataConfig[index];
        if (result.error) {
          usedFallback = true;
          return;
        }
        nextData[config.stateKey] = result.data || [];
        await cacheCalculatorData(config.cacheType, result.data || []);
      }));

      nextData.drugCalculators = mergeRows(nextData.drugCalculators, offlineDoses);
      setData(nextData);
      setCacheStatus({
        usingCache: usedFallback,
        lastUpdated: latestDate([
          ...await Promise.all(calculatorDataConfig.map(({ cacheType }) => getLastCalculatorCacheUpdate(cacheType))),
          ...offlineDoseDates
        ])
      });
      if (usedFallback) toast("Some calculator data is being loaded from the offline cache.");
    } catch (error) {
      console.error("Could not load calculator data", error);
      setCacheStatus((current) => ({ ...current, usingCache: true }));
      toast.error("Could not load saved calculator data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClinicalTools();
  }, [isOnline]);

  const logCalculation = async ({ calculator_type, drug_name, patient_weight, result }) => {
    if (!user?.id) return true;
    const payload = {
      user_id: user.id,
      calculator_type,
      drug_name: drug_name || null,
      patient_weight: patient_weight || null,
      result
    };
    if (!isOnline) {
      const saved = await cacheLocalCalculation(user.id, payload);
      if (saved) toast.success("Calculation saved locally");
      else toast("Calculation completed, but local history could not be saved.");
      return true;
    }
    const { error } = await supabase.from("calculator_logs").insert(payload);
    if (error) {
      const saved = await cacheLocalCalculation(user.id, payload);
      toast(saved
        ? "Calculation saved locally; cloud history is unavailable."
        : "Calculation completed, but cloud and local history are unavailable.");
      return true;
    }
    return true;
  };

  const activeDataRows = {
    drug: data.drugCalculators,
    protocol: data.drugCalculators,
    emergency: data.emergencyDrugs,
    fluids: data.fluidCalculators,
    transfusion: data.transfusionCalculators,
    cri: data.criProtocols,
    toxicology: data.toxicities,
    interaction: offlineDrugOptions
  }[activeTab];
  const missingOfflineData = !isOnline
    && Array.isArray(activeDataRows)
    && activeDataRows.length === 0
    && activeTab !== "pill_counter";

  return (
    <div className="space-y-6 pb-8">
      {showBanner && (
        <PageBanner
          title="Clinical Tools"
          subtitle="Calculate doses, CRIs, fluids, transfusions and toxicology guidance."
          darkMode={darkMode}
          // Changed text from "Clinical calculators" to "Clinical calculator" to meet requirement 4
          badges={[{ label: "Clinical calculator", icon: <Calculator size={14} />, accent: true }]}
        />
      )}

      <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition flex items-center gap-2 shrink-0 ${
                activeTab === tab.id
                  ? "bg-[#71CFC2] text-[#062F63] shadow-md"
                  : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"
              }`}
            >
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
      </div>

      {(!isOnline || cacheStatus.usingCache) && (
        <OfflineCalculatorBanner darkMode={darkMode} lastUpdated={cacheStatus.lastUpdated} />
      )}

      {loading ? (
        <div className={`${panelClass(darkMode)} flex flex-col items-center justify-center py-16 gap-4`}>
          <HeartbeatLoader size={72} />
          <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2]">Loading Clinical Tools...</p>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {missingOfflineData ? (
            <MissingOfflineCalculatorData darkMode={darkMode} />
          ) : (
            <>
              {activeTab === "drug" && <DrugCalculator rows={data.drugCalculators} darkMode={darkMode} onLog={logCalculation} protocolContext={null} user={user} isOnline={isOnline} offlineDrugOptions={offlineDrugOptions} offlineInteractions={offlineInteractions} />}
              {activeTab === "protocol" && <DrugCalculator rows={data.drugCalculators} darkMode={darkMode} onLog={logCalculation} protocolContext={protocolContext} setProtocolContext={setProtocolContext} protocolMode user={user} isOnline={isOnline} offlineDrugOptions={offlineDrugOptions} offlineInteractions={offlineInteractions} />}
              {activeTab === "emergency" && <EmergencyCalculator rows={data.emergencyDrugs} darkMode={darkMode} onLog={logCalculation} isOnline={isOnline} offlineInteractions={offlineInteractions} />}
              {activeTab === "fluids" && <FluidCalculator rows={data.fluidCalculators} darkMode={darkMode} onLog={logCalculation} />}
              {activeTab === "transfusion" && <TransfusionCalculator rows={data.transfusionCalculators} darkMode={darkMode} onLog={logCalculation} />}
              {activeTab === "cri" && <CriCalculator rows={data.criProtocols} darkMode={darkMode} onLog={logCalculation} />}
              {activeTab === "toxicology" && <Toxicology rows={data.toxicities} darkMode={darkMode} />}
              {activeTab === "interaction" && <InteractionChecker darkMode={darkMode} user={user} isOnline={isOnline} offlineDrugOptions={offlineDrugOptions} offlineInteractions={offlineInteractions} />}
            </>
          )}
          {activeTab === "pill_counter" && <PillCounterTab darkMode={darkMode} />}
        </div>
      )}
    </div>
  );
}

export function ClinicalToolsHistory({ user, darkMode = false }) {
  const isOnline = useOnlineStatus();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const loadCalculationHistory = async () => {
    if (!user?.id) return;
    setHistoryLoading(true);
    const localHistory = await getLocalCalculationHistory(user.id);
    if (!isOnline) {
      setHistory(localHistory);
      setHistoryLoading(false);
      return;
    }
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { data: logs, error } = await supabase
      .from("calculator_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (error) {
      setHistory(localHistory);
      toast("Cloud history is unavailable. Showing locally saved calculations.");
    } else {
      setHistory([...(localHistory || []), ...(logs || [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
    }
    setHistoryLoading(false);
  };

  useEffect(() => {
    loadCalculationHistory();
  }, [user?.id, isOnline]);

  return <CalculationHistory rows={history} loading={historyLoading} darkMode={darkMode} onRefresh={loadCalculationHistory} />;
}

function PillCounterTab({ darkMode }) {
  return (
    <ToolShell
      darkMode={darkMode}
      title="AI Pill Count"
      icon={<Pill size={20} />}
      subtitle="Use your device camera and ONNX model to automatically count medication."
    >
      <div className={`p-10 text-center rounded-lg border-2 border-dashed ${darkMode ? "border-white/20 text-white/50" : "border-[#0B3760]/20 text-[#0B3760]/50"}`}>
        <p className="font-black mb-2">Pill Count Interface</p>
        <p className="text-sm">Integrate your YOLOv8 ONNX web component here.</p>
      </div>
    </ToolShell>
  );
}

function CalculationSummaryModal({ open, onClose, doses, interactions, darkMode, offlineData = false }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-[#F9FCFB] text-[#113247]"}`}>
        <div className={`shrink-0 px-6 py-5 border-b flex justify-between items-center ${darkMode ? "border-white/10" : "border-slate-200"}`}>
          <h3 className="font-black text-xl flex items-center gap-2">
            <AlertTriangle size={22} className="text-amber-500" /> Calculated Dose Set
          </h3>
          <button onClick={onClose} className={`h-10 w-10 grid place-items-center rounded-lg transition ${darkMode ? "bg-white/10 text-[#71CFC2] hover:bg-white/15" : "bg-[#E8F8F5] text-[#0F8F83] hover:bg-[#DFF4F1]"}`} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          <div>
            <p className="text-xs font-black uppercase tracking-widest opacity-45 mb-3">Doses logged together</p>
            <div className="space-y-3">
              {(doses || []).map((doseItem, index) => (
                <div key={`${doseItem.name}-${index}`} className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="font-black">{doseItem.name}</div>
                      <div className="text-xs opacity-60">{doseItem.route} | {doseItem.doseLabel}</div>
                    </div>
                    <span className="text-xs font-black text-[#0F8F83]">{doseItem.concentrationLabel}</span>
                  </div>
                  <p className="text-sm leading-6 font-bold text-[#0F8F83]">{doseItem.result}</p>
                  {doseItem.guidance && <p className="text-xs leading-5 opacity-65 mt-2">{doseItem.guidance}</p>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-widest opacity-45 mb-3">Interaction warnings</p>
            {!interactions || interactions.length === 0 ? (
              <p className={`text-sm font-bold ${offlineData ? "text-amber-700 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-400"}`}>
                {offlineData ? "No interaction was found in saved offline data. This does not confirm that no interaction exists." : "No known interactions found between selected drugs."}
              </p>
            ) : (
              <div className="space-y-3">
                {interactions.map((warning, index) => (
                  <div key={warning.id || index} className={`p-4 rounded-lg border ${darkMode ? "bg-amber-500/10 border-amber-500/20" : "bg-amber-50 border-amber-200"}`}>
                    <p className="font-bold text-amber-700 dark:text-amber-400 mb-1">{warning.drug_name} + {warning.interacting_drug}</p>
                    <p className="text-sm opacity-90">{warning.interaction || warning.mechanism || warning.recommendation || warning.notes}</p>
                    {warning.severity && <p className="text-[10px] uppercase tracking-widest font-black text-amber-600 mt-2">Severity: {warning.severity}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={`shrink-0 p-4 border-t ${darkMode ? "border-white/10" : "border-slate-200"}`}>
          <button onClick={onClose} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] py-3 font-black">
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DrugCalculator({ rows, darkMode, onLog, protocolContext, setProtocolContext, protocolMode = false, user, isOnline, offlineDrugOptions, offlineInteractions }) {
  const [species, setSpecies] = useState("Dog");
  const [weight, setWeight] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [dose, setDose] = useState("");
  const [doseSet, setDoseSet] = useState([]);
  const [summaryModal, setSummaryModal] = useState({ open: false, doses: [], interactions: [] });
  const [drugSearch, setDrugSearch] = useState("");
  const [drugSearchResults, setDrugSearchResults] = useState([]);
  const [drugSearchLoading, setDrugSearchLoading] = useState(false);
  const [selectedDatabaseDrug, setSelectedDatabaseDrug] = useState(null);
  const [selectedDrugDetails, setSelectedDrugDetails] = useState(null);

  const speciesRows = useMemo(() => rows.filter((row) => row.species === species), [rows, species]);
  const selected = useMemo(() => {
    const row = speciesRows.find((item) => String(item.id) === String(selectedId));
    if (row) return row;
    if (selectedDatabaseDrug) return buildCalculatorRowFromDrug(selectedDatabaseDrug, species, rows);
    return firstBySpecies(speciesRows.filter(hasCompleteDoseData), species) || firstBySpecies(speciesRows, species);
  }, [rows, selectedDatabaseDrug, selectedId, species, speciesRows]);
  const doseMap = doseMapFrom(protocolContext);

  const protocolDrugNames = useMemo(() => {
    return [...new Set((protocolContext?.drugs || []).map((drug) => normalise(drug.name)).filter(Boolean))];
  }, [protocolContext?.drugs]);

  const protocolRows = useMemo(() => {
    if (!protocolDrugNames.length) return [];
    return speciesRows.filter((row) => protocolDrugNames.includes(normalise(row.drug_name)));
  }, [protocolDrugNames, speciesRows]);
  const filteredCalculatorRows = useMemo(() => {
    const query = normalise(drugSearch);
    if (!query) return [];
    return speciesRows
      .filter((row) => [row.drug_name, row.route, row.dose_unit, row.notes].some((value) => normalise(value).includes(query)))
      .slice(0, 12);
  }, [drugSearch, speciesRows]);

  useEffect(() => {
    const firstProtocolSpecies = protocolContext?.drugs?.[0]?.species;
    if (firstProtocolSpecies && species !== firstProtocolSpecies) {
      setSpecies(firstProtocolSpecies);
      setSelectedId("");
    }
  }, [protocolContext?.protocol?.id]);

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(String(selected.id));
  }, [selected, selectedId]);

  useEffect(() => {
    if (selected) setDose(selected.min_dose || selected.max_dose || "");
  }, [selected?.id]);

  useEffect(() => {
    let cancelled = false;
    const query = drugSearch.trim();

    if (query.length < 2) {
      setDrugSearchResults([]);
      setDrugSearchLoading(false);
      return undefined;
    }

    setDrugSearchLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = isOnline
          ? await drugService.searchCalculatorDrugs(query, user?.id)
          : (offlineDrugOptions || []).filter((drug) => [
            drug.name,
            drug.category,
            drug.species,
            drug.route,
            ...(drug.drug_aliases || []).map((alias) => alias.alias || alias.name)
          ].some((value) => normalise(value).includes(normalise(query)))).slice(0, 20);
        if (!cancelled) setDrugSearchResults(results);
      } catch {
        if (!cancelled) {
          setDrugSearchResults((offlineDrugOptions || []).filter((drug) => normalise(drug.name).includes(normalise(query))).slice(0, 20));
          toast("Using saved formulary drugs");
        }
      } finally {
        if (!cancelled) setDrugSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [drugSearch, user?.id, isOnline, offlineDrugOptions]);

  const addCalculatorRowToSet = (row, drugName = row?.drug_name) => {
    if (!row) return toast.error("Select a drug first");
    if (!hasCompleteDoseData(row)) {
      return toast.error(`Cannot calculate: missing ${missingDoseFields(row).join(", ")}`);
    }
    const resolvedName = drugName || row.drug_name;
    const entryKey = `${row.id || resolvedName}|${row.route || ""}|${row.concentration || ""}`;
    if (doseSet.some((entry) => entry.entryKey === entryKey)) {
      toast.error("That drug is already in this calculation set");
      return;
    }
    setDoseSet((prev) => [
      ...prev,
      {
        entryId: `${entryKey}|${Date.now()}`,
        entryKey,
        row,
        drugName: resolvedName,
        dose: String(row.min_dose || row.max_dose || "")
      }
    ]);
    setDrugSearch("");
    setDrugSearchResults([]);
    toast.success("Drug added to calculator");
  };

  const selectDatabaseDrug = async (drug) => {
    const nextSpecies = drug.species || species;
    const calculatorRow = buildCalculatorRowFromDrug(drug, nextSpecies, rows);
    addCalculatorRowToSet(calculatorRow, drug.name);
  };

  const previewDatabaseDrug = async (drug) => {
    const nextSpecies = drug.species || species;
    setSpecies(nextSpecies);
    setSelectedDatabaseDrug(drug);
    setDrugSearch(drug.name || "");
    setDrugSearchResults([]);

    const calculatorRow = findCalculatorRowForDrug(rows, drug, nextSpecies);
    setSelectedId(calculatorRow ? String(calculatorRow.id) : "");
    setDose(calculatorRow?.min_dose || calculatorRow?.max_dose || drug.dose_min || drug.min_dose || "");

    if (!isOnline && drug.offline_summary) {
      setSelectedDrugDetails(drug.offline_summary);
    } else {
      try {
        setSelectedDrugDetails(await drugService.getDrugClinicalDetails(drug));
      } catch {
        setSelectedDrugDetails(drug.offline_summary || null);
      }
    }
  };

  const handleCalculatorSelect = (value) => {
    if (!value) return;
    const row = speciesRows.find((item) => String(item.id) === String(value));
    if (row) addCalculatorRowToSet(row);
    setSelectedDatabaseDrug(null);
    setSelectedDrugDetails(null);
  };

  const doseValue = numberValue(dose || selected?.min_dose);
  const weightValue = numberValue(weight);
  const totalDose = weightValue * doseValue;
  const volume = selected?.concentration ? totalDose / numberValue(selected.concentration) : null;

  const buildMainDoseSummary = (entry) => {
    const row = entry.row;
    const entryDose = numberValue(entry.dose || row?.min_dose || row?.max_dose);
    const total = weightValue * entryDose;
    const concentration = numberValue(row?.concentration, 0);
    const entryVolume = concentration > 0 ? total / concentration : null;
    const totalUnit = row?.dose_unit?.split("/")[0] || "mg";
    return buildDoseSummary({
      name: entry.drugName || row?.drug_name,
      route: row?.route,
      doseLabel: `${formatNumber(entryDose)} ${row?.dose_unit || "mg/kg"}`,
      concentrationLabel: row?.concentration ? `${row.concentration} ${row.concentration_unit || "mg/ml"}` : "No concentration",
      result: `${entry.drugName || row?.drug_name}: ${formatNumber(total)} ${totalUnit}${entryVolume ? `, give ${formatNumber(entryVolume)} ml` : ""}`
    });
  };

  const updateDoseSetDose = (entryId, value) => {
    setDoseSet((prev) => prev.map((entry) => entry.entryId === entryId ? { ...entry, dose: value } : entry));
  };

  const saveLog = async () => {
    if (weightValue <= 0 || (!protocolMode && doseSet.length === 0) || (protocolMode && !selected)) return toast.error("Add a weight and select a drug");
    const entries = protocolMode
      ? [{
        row: selected,
        drugName: selectedDatabaseDrug?.name || selected.drug_name,
        dose: String(dose || selected.min_dose || selected.max_dose || "")
      }]
      : doseSet;
    const incomplete = entries.find((entry) => !hasCompleteDoseData(entry.row));
    if (incomplete) return toast.error(`Cannot calculate ${incomplete.drugName || incomplete.row?.drug_name}: missing ${missingDoseFields(incomplete.row).join(", ")}`);
    const doseSummaries = entries.map(buildMainDoseSummary);
    const result = doseSummaries.map((item) => item.result).join("; ");
    const drugNames = uniqueValues(doseSummaries.map((item) => item.name));
    let interactions = [];
    try {
      interactions = await fetchInteractionWarningsForDrugNames(drugNames, { isOnline, cachedInteractions: offlineInteractions });
    } catch {
      toast.error("Could not check interactions");
    }
    const logged = await onLog({ calculator_type: "drug", drug_name: drugNames.join(", "), patient_weight: weightValue, result });
    if (logged === false) return;
    setSummaryModal({ open: true, doses: doseSummaries, interactions });
    toast.success("Calculation logged");
  };

  const saveProtocolLog = () => {
    if (!protocolContext?.protocol || weightValue <= 0 || protocolRows.length === 0) return toast.error("Add a weight and check protocol drugs are available");
    const incomplete = protocolRows.find((row) => !hasCompleteDoseData(row));
    if (incomplete) return toast.error(`Cannot calculate ${incomplete.drug_name}: missing ${missingDoseFields(incomplete).join(", ")}`);
    const result = protocolRows.map((row) => formatProtocolCalculation(row, weightValue, doseMap, protocolContext.drugs || [])).join("; ");
    onLog({ calculator_type: "protocol", drug_name: protocolContext.protocol.name, patient_weight: weightValue, result });
    toast.success("Protocol calculation logged");
  };

  return (
    <ToolShell
      darkMode={darkMode}
      title={protocolMode ? "Protocol-based Calculator" : "Drug Calculator"}
      icon={protocolMode ? <ClipboardList size={20} /> : <Calculator size={20} />}
      subtitle={protocolMode ? "Select a saved protocol, enter weight, and calculate all matching medicines." : "Calculate dose and volume from weight, dose rate and product concentration."}
    >
      {!protocolMode && (
        <CalculationSummaryModal
          open={summaryModal.open}
          onClose={() => setSummaryModal({ open: false, doses: [], interactions: [] })}
          doses={summaryModal.doses}
          interactions={summaryModal.interactions}
          darkMode={darkMode}
          offlineData={!isOnline}
        />
      )}
      {protocolMode && <ProtocolContextSelector user={user} darkMode={darkMode} onProtocolChange={setProtocolContext} />}
      <SpeciesWeight species={species} setSpecies={(value) => { setSpecies(value); setSelectedId(""); if (!protocolMode) setDoseSet([]); }} weight={weight} setWeight={setWeight} darkMode={darkMode} />
      {!protocolMode && (
        <div className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
          <h3 className="font-black mb-4 flex items-center gap-2"><Plus size={18} /> Add to Calculator</h3>
          <div className="relative mb-3">
            <Search size={17} className="absolute left-3 top-3.5 opacity-45" />
            <input
              className={`${fieldClass(darkMode)} pl-10`}
              placeholder="Search drugs by name..."
              value={drugSearch}
              onChange={(event) => setDrugSearch(event.target.value)}
            />
          </div>
          {drugSearch.trim().length > 0 && (
            <div className="space-y-2 mb-3">
              {drugSearchLoading && <div className="p-3 text-sm opacity-60">Searching...</div>}
              {!drugSearchLoading && filteredCalculatorRows.length === 0 && drugSearchResults.length === 0 && (
                <p className="text-sm opacity-55">No matching drugs for {species}.</p>
              )}
              {!drugSearchLoading && filteredCalculatorRows.map((row) => (
                <button
                  key={`calc-row-${row.id}`}
                  type="button"
                  onClick={() => addCalculatorRowToSet(row)}
                  disabled={!hasCompleteDoseData(row)}
                  className={`w-full text-left rounded-lg p-3 border ${darkMode ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-[#DCEDEA] bg-white hover:bg-[#F0F6F5]"}`}
                >
                  <div className="font-black text-sm">{row.drug_name}</div>
                  <div className="text-xs opacity-60">
                    {[row.route || "General route", row.min_dose || row.max_dose ? `${row.min_dose || row.max_dose}${row.max_dose && row.max_dose !== row.min_dose ? ` - ${row.max_dose}` : ""} ${row.dose_unit || "mg/kg"}` : "", row.concentration ? `${row.concentration} ${row.concentration_unit || "mg/ml"}` : ""].filter(Boolean).join(" | ")}
                  </div>
                  {!hasCompleteDoseData(row) && <div className="mt-1 text-xs font-bold text-amber-600">Unavailable: missing {missingDoseFields(row).join(", ")}</div>}
                </button>
              ))}
              {!drugSearchLoading && drugSearchResults.map((drug) => (
                <button
                  key={`db-drug-${drug.id}`}
                  type="button"
                  onClick={() => selectDatabaseDrug(drug)}
                  className={`w-full text-left rounded-lg p-3 border ${darkMode ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-[#DCEDEA] bg-white hover:bg-[#F0F6F5]"}`}
                >
                  <div className="font-black text-sm">{drug.name}</div>
                  <div className="text-xs opacity-60">
                    {[drug.species, drug.route, drug.category, ...(drug.drug_aliases || []).map((alias) => alias.alias)].filter(Boolean).join(" | ")}
                  </div>
                </button>
              ))}
            </div>
          )}
          <select className={fieldClass(darkMode)} defaultValue="" onChange={(event) => { handleCalculatorSelect(event.target.value); event.target.value = ""; }}>
            <option value="" disabled>Add single drug...</option>
            {speciesRows.map((row) => <option key={row.id} value={row.id} disabled={!hasCompleteDoseData(row)}>{row.drug_name} ({row.route || "General"})</option>)}
          </select>
        </div>
      )}

      {!protocolMode && doseSet.length > 0 && (
        <div className={`rounded-lg border-2 border-[#71CFC2]/30 p-4 space-y-4 ${darkMode ? "bg-white/5" : "bg-white/90"}`}>
          <h3 className="font-black">Calculated Doses</h3>
          {doseSet.map((entry) => {
            const summary = buildMainDoseSummary(entry);
            return (
              <div key={entry.entryId} className="mb-4 pb-4 border-b border-slate-200 dark:border-white/10 last:border-0 last:mb-0 last:pb-0">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-bold">{entry.drugName}</div>
                  <button onClick={() => setDoseSet((prev) => prev.filter((item) => item.entryId !== entry.entryId))} className="text-red-400">
                    <X size={16} />
                  </button>
                </div>
                <div className="text-xs opacity-70 mb-2">Route: {entry.row.route || "General"} | {summary.concentrationLabel}</div>
                <DoseRange row={entry.row} dose={entry.dose} setDose={(value) => updateDoseSetDose(entry.entryId, value)} darkMode={darkMode} />
                <p className="mt-3 text-sm leading-6 font-bold text-[#0F8F83]">{summary.result}</p>
              </div>
            );
          })}
          <LogButton onClick={saveLog} label="Log all selected doses" />
        </div>
      )}

      {protocolMode && (
        <>
          <div className="relative">
            <Search size={17} className="absolute left-3 top-3.5 opacity-45" />
            <input
              className={`${fieldClass(darkMode)} pl-10`}
              placeholder="Search drug database by generic or brand name..."
              value={drugSearch}
              onChange={(event) => setDrugSearch(event.target.value)}
            />
            {(drugSearchLoading || drugSearchResults.length > 0) && (
              <div className={`absolute z-20 mt-2 w-full rounded-lg border overflow-hidden shadow-xl ${darkMode ? "bg-[#071A24] border-white/10" : "bg-white border-[#DCEDEA]"}`}>
                {drugSearchLoading && <div className="p-3 text-sm opacity-60">Searching...</div>}
                {!drugSearchLoading && drugSearchResults.map((drug) => (
                  <button key={drug.id} type="button" onClick={() => previewDatabaseDrug(drug)} className={`w-full text-left p-3 border-b last:border-b-0 ${darkMode ? "border-white/10 hover:bg-white/10" : "border-[#DCEDEA] hover:bg-[#F0F6F5]"}`}>
                    <div className="font-black text-sm">{drug.name}</div>
                    <div className="text-xs opacity-60">
                      {[drug.species, drug.route, drug.category, ...(drug.drug_aliases || []).map((alias) => alias.alias)].filter(Boolean).join(" | ")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {protocolContext?.protocol && (
            <ProtocolDoseSet
              darkMode={darkMode}
              protocol={protocolContext.protocol}
              protocolDrugs={protocolContext.drugs || []}
              doseMap={doseMap}
              rows={protocolRows}
              weightValue={weightValue}
              species={species}
              onLog={saveProtocolLog}
            />
          )}
          <select className={fieldClass(darkMode)} value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setSelectedDatabaseDrug(null); setSelectedDrugDetails(null); setDrugSearch(""); setDrugSearchResults([]); }}>
            {speciesRows.length === 0 && <option value="">No drugs for this species</option>}
            {selectedDatabaseDrug && !speciesRows.some((row) => String(row.id) === String(selectedId)) && (
              <option value={selectedId || `drug-${selectedDatabaseDrug.id}`}>{selectedDatabaseDrug.name} (database record)</option>
            )}
            {speciesRows.map((row) => <option key={row.id} value={row.id} disabled={!hasCompleteDoseData(row)}>{row.drug_name} {row.route ? `(${row.route})` : ""}</option>)}
          </select>
          {selected && (
            <>
              {selectedDatabaseDrug && (
                <SelectedDrugSummary drug={selectedDatabaseDrug} details={selectedDrugDetails} darkMode={darkMode} />
              )}
              {hasCompleteDoseData(selected) ? (
                <>
                  <DoseRange row={selected} dose={dose} setDose={setDose} darkMode={darkMode} />
                  <ResultGrid items={[
                    ["Dose", `${formatNumber(totalDose)} ${selected.dose_unit.split("/")[0]}`],
                    ["Give", `${formatNumber(volume)} ml`]
                  ]} />
                </>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
                  Cannot calculate this drug because {missingDoseFields(selected).join(", ")} is missing.
                </p>
              )}
              <Notes row={selected} />
              {hasCompleteDoseData(selected) && <LogButton onClick={saveLog} />}
            </>
          )}
        </>
      )}
    </ToolShell>
  );
}

function InteractionChecker({ darkMode, user, isOnline, offlineDrugOptions, offlineInteractions }) {
    const [interactionDrugs, setInteractionDrugs] = useState([]);
    const [interactionSearch, setInteractionSearch] = useState("");
    const [interactionSearchResults, setInteractionSearchResults] = useState([]);
    const [interactionLoading, setInteractionLoading] = useState(false);
    const [interactionResults, setInteractionResults] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const query = interactionSearch.trim();

        if (query.length < 2) {
            setInteractionSearchResults([]);
            setSearchLoading(false);
            return undefined;
        }

        setSearchLoading(true);
        const timer = window.setTimeout(async () => {
            try {
                const results = isOnline
                  ? await drugService.searchCalculatorDrugs(query, user?.id)
                  : (offlineDrugOptions || []).filter((drug) => [
                    drug.name,
                    drug.category,
                    drug.species,
                    ...(drug.drug_aliases || []).map((alias) => alias.alias || alias.name)
                  ].some((value) => normalise(value).includes(normalise(query)))).slice(0, 20);
                if (!cancelled) setInteractionSearchResults(results);
            } catch {
                if (!cancelled) {
                    setInteractionSearchResults((offlineDrugOptions || []).filter((drug) => normalise(drug.name).includes(normalise(query))).slice(0, 20));
                    toast("Using saved formulary drugs");
                }
            } finally {
                if (!cancelled) setSearchLoading(false);
            }
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [interactionSearch, user?.id, isOnline, offlineDrugOptions]);

    useEffect(() => {
        const checkInteractions = async () => {
            if (interactionDrugs.length < 2) {
                setInteractionResults(null);
                return;
            }
            setInteractionLoading(true);
            try {
                const results = await fetchInteractionWarningsForDrugNames(
                  interactionDrugs.map((drug) => drug.name),
                  { isOnline, cachedInteractions: offlineInteractions }
                );
                setInteractionResults(results);
            } catch (err) {
                console.error(err);
                setInteractionResults(filterInteractionWarningsForDrugNames(offlineInteractions, interactionDrugs.map((drug) => drug.name)));
                toast("Using saved interaction data");
            } finally {
                setInteractionLoading(false);
            }
        };
        checkInteractions();
    }, [interactionDrugs, isOnline, offlineInteractions]);

    const addInteractionDrug = (drug) => {
        if (!interactionDrugs.find((d) => d.id === drug.id)) {
            setInteractionDrugs([...interactionDrugs, drug]);
        }
        setInteractionSearch("");
        setInteractionSearchResults([]);
    };

    return (
        <ToolShell
            darkMode={darkMode}
            title="Interaction Checker"
            icon={<AlertOctagon size={20} />}
            subtitle="Add two or more drugs to check for recorded interactions."
        >
            <div className="relative">
                <Search size={17} className="absolute left-3 top-3.5 opacity-45" />
                <input
                    className={`${fieldClass(darkMode)} pl-10`}
                    placeholder="Search drug to add to checker..."
                    value={interactionSearch}
                    onChange={(event) => setInteractionSearch(event.target.value)}
                />
                {(searchLoading || interactionSearchResults.length > 0) && (
                    <div className={`absolute z-20 mt-2 w-full rounded-lg border overflow-hidden shadow-xl ${darkMode ? "bg-[#071A24] border-white/10" : "bg-white border-[#DCEDEA]"}`}>
                        {searchLoading && <div className="p-3 text-sm opacity-60">Searching...</div>}
                        {!searchLoading && interactionSearchResults.map((drug) => (
                            <button key={drug.id} type="button" onClick={() => addInteractionDrug(drug)} className={`w-full text-left p-3 border-b last:border-b-0 ${darkMode ? "border-white/10 hover:bg-white/10" : "border-[#DCEDEA] hover:bg-[#F0F6F5]"}`}>
                                <div className="font-black text-sm">{drug.name}</div>
                                <div className="text-xs opacity-60">
                                    {[drug.species, drug.route, drug.category].filter(Boolean).join(" | ")}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {interactionDrugs.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                    {interactionDrugs.map((d) => (
                        <span key={d.id} className={`px-3 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 ${darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
                            {d.name} <button onClick={() => setInteractionDrugs(interactionDrugs.filter((i) => i.id !== d.id))} className="opacity-50 hover:opacity-100"><X size={14} /></button>
                        </span>
                    ))}
                </div>
            )}

            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-white/10">
                <h3 className="font-black mb-4 flex items-center gap-2"><AlertTriangle className="text-amber-500" size={18} /> Interaction Warnings</h3>
                
                {interactionDrugs.length < 2 ? (
                    <p className="text-sm opacity-60">Add another drug to check for interactions.</p>
                ) : interactionLoading ? (
                    <div className="flex items-center gap-2 text-sm opacity-70"><Loader2 size={16} className="animate-spin" /> Checking interactions...</div>
                ) : interactionResults?.length > 0 ? (
                    <div className="space-y-3">
                        {interactionResults.map((warn, i) => (
                            <div key={i} className={`p-4 rounded-lg border ${darkMode ? "bg-amber-500/10 border-amber-500/20" : "bg-amber-50 border-amber-200"}`}>
                                <p className="font-bold text-amber-700 dark:text-amber-400 mb-1">{warn.drug_name} + {warn.interacting_drug}</p>
                                <p className="text-sm opacity-90">{warn.interaction || warn.mechanism || warn.recommendation || warn.notes}</p>
                                {warn.severity && <p className="text-[10px] uppercase tracking-widest font-black text-amber-600 mt-2">Severity: {warn.severity}</p>}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className={`text-sm font-bold ${isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"}`}>
                      {isOnline ? "No known interactions found between selected drugs." : "No interaction was found in saved offline data. This does not confirm that no interaction exists."}
                    </p>
                )}
                {!isOnline && interactionDrugs.length >= 2 && (
                  <p className="mt-3 text-xs leading-5 text-amber-600 dark:text-amber-300">Offline data may be incomplete. Check latest formulary when online.</p>
                )}
            </div>
        </ToolShell>
    );
}

function findCalculatorRowForDrug(rows, drug, species) {
  const names = [drug.name, ...(drug.drug_aliases || []).map((alias) => alias.alias)].map(normalise).filter(Boolean);
  return rows.find((row) => row.species === species && names.includes(normalise(row.drug_name)))
    || rows.find((row) => names.includes(normalise(row.drug_name)))
    || null;
}

function buildCalculatorRowFromDrug(drug, species, rows) {
  const row = findCalculatorRowForDrug(rows, drug, species);
  if (row) return row;
  return {
    id: `drug-${drug.id}`,
    drug_name: drug.name,
    species: drug.species || species,
    min_dose: drug.dose_min || drug.min_dose || "",
    max_dose: drug.dose_max || drug.max_dose || drug.dose_min || drug.min_dose || "",
    dose_unit: drug.dose_unit || "mg/kg",
    route: drug.route || "",
    concentration: drug.concentration || "",
    concentration_unit: drug.concentration_unit || "mg/ml",
    notes: drug.notes || drug.summary || drug.clinical_summary || ""
  };
}

function SelectedDrugSummary({ drug, details, darkMode }) {
  const warnings = [
    ...(details?.warnings || []),
    ...(details?.contraindications || []),
    ...(details?.interactions || []),
    ...(details?.monitoring || []),
    ...(details?.speciesWarnings || [])
  ];
  const aliases = [...(drug.drug_aliases || []), ...(details?.aliases || [])].map((item) => item.alias || item.name).filter(Boolean);

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
      <div>
        <p className="text-xs font-black uppercase tracking-widest opacity-45">Selected from formulary</p>
        <h3 className="font-black text-base leading-tight">{drug.name}</h3>
        {aliases.length > 0 && <p className="text-xs opacity-60 mt-1">Also known as {aliases.slice(0, 5).join(", ")}</p>}
      </div>
      <InfoLine label="Class" value={drug.category || drug.drug_class} />
      <InfoLine label="Route" value={drug.route} />
      <InfoLine label="Dose data" value={(drug.dose_min || drug.dose_max) ? `${drug.dose_min || drug.dose_max}${drug.dose_max && drug.dose_max !== drug.dose_min ? ` - ${drug.dose_max}` : ""} ${drug.dose_unit || "mg/kg"}` : ""} />
      {warnings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest opacity-45">Clinical cautions</p>
          {warnings.slice(0, 5).map((item, index) => (
            <p key={index} className="text-sm leading-6 opacity-75">
              <span className="font-black">{item.title || item.warning_type || item.severity || item.species || "Note"}: </span>
              {item.description || item.warning_text || item.warning || item.contraindication || item.interaction || item.recommendation || item.notes || item.mechanism}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ProtocolDoseSet({ darkMode, protocol, protocolDrugs, doseMap, rows, weightValue, species, onLog }) {
  const unmatched = protocolDrugs.filter((drug) => drug.species === species && !rows.some((row) => normalise(row.drug_name) === normalise(drug.name)));

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
      <div>
        <p className="text-xs font-black uppercase tracking-widest opacity-45">Protocol dose set</p>
        <h3 className="font-black text-base leading-tight">{protocol.name}</h3>
        {protocol.indication && <p className="text-sm opacity-60 leading-6">{protocol.indication}</p>}
      </div>

      {weightValue <= 0 && <p className="text-sm opacity-65">Enter a patient weight above to calculate every matching protocol drug.</p>}
      {rows.length === 0 && weightValue > 0 && <p className="text-sm opacity-65">No calculator rows match this protocol for {species}. Check the protocol species or add calculator records for these drugs.</p>}

      {rows.map((row) => {
        if (!hasCompleteDoseData(row)) {
          return (
            <div key={row.id} className={`rounded-lg border p-3 ${darkMode ? "border-amber-400/20 bg-amber-500/10" : "border-amber-200 bg-amber-50"}`}>
              <div className="font-black">{row.drug_name}</div>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-200">Cannot calculate: missing {missingDoseFields(row).join(", ")}.</p>
            </div>
          );
        }
        const doseSetting = getProtocolDoseSetting(row, doseMap, protocolDrugs);
        const exactDose = numberValue(doseSetting?.dose, NaN);
        const hasProtocolDose = Number.isFinite(exactDose) && exactDose > 0;
        const minDose = hasProtocolDose ? exactDose : numberValue(row.min_dose || row.dose_min);
        const maxDose = hasProtocolDose ? exactDose : numberValue(row.max_dose || row.dose_max, minDose);
        const minTotal = weightValue * minDose;
        const maxTotal = weightValue * maxDose;
        const minVolume = row.concentration ? minTotal / numberValue(row.concentration) : null;
        const maxVolume = row.concentration ? maxTotal / numberValue(row.concentration) : null;
        const doseUnit = doseSetting?.dose_unit || row.dose_unit || "mg/kg";
        const totalUnit = doseUnit.split("/")[0] || "mg";
        return (
          <div key={row.id} className={`rounded-lg p-3 ${darkMode ? "bg-black/10" : "bg-[#F0F6F5]"}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="font-black">{row.drug_name}</div>
                <div className="text-xs opacity-60">{doseSetting?.route || row.route || "General route"} | {doseUnit}</div>
              </div>
              <span className="text-xs font-black text-[#0F8F83]">{hasProtocolDose ? "Protocol dose" : row.species}</span>
            </div>
            <ResultGrid items={[
              ["Dose", `${formatDoseRange(minTotal, maxTotal)} ${totalUnit}`],
              ["Give", minVolume ? `${formatDoseRange(minVolume, maxVolume)} ml` : "No concentration"]
            ]} />
            {doseSetting?.notes && <p className="text-sm leading-6 opacity-70"><span className="font-black">Protocol note: </span>{doseSetting.notes}</p>}
            <Notes row={row} />
          </div>
        );
      })}

      {unmatched.length > 0 && (
        <p className="text-xs opacity-55 leading-5">
          No calculator data for: {unmatched.map((drug) => drug.name).join(", ")}.
        </p>
      )}

      {rows.some(hasCompleteDoseData) && <LogButton onClick={onLog} />}
    </div>
  );
}

function getProtocolDoseSetting(row, doseMap, protocolDrugs) {
  const matchedDrug = protocolDrugs.find((drug) => normalise(drug.name) === normalise(row.drug_name));
  if (!matchedDrug) return null;
  return doseMap[String(matchedDrug.id)] || null;
}

function formatDoseRange(min, max) {
  if (!Number.isFinite(max) || max === min) return formatNumber(min);
  return `${formatNumber(min)} - ${formatNumber(max)}`;
}

function formatProtocolCalculation(row, weightValue, doseMap, protocolDrugs) {
  const doseSetting = getProtocolDoseSetting(row, doseMap, protocolDrugs);
  const exactDose = numberValue(doseSetting?.dose, NaN);
  const hasProtocolDose = Number.isFinite(exactDose) && exactDose > 0;
  const minDose = hasProtocolDose ? exactDose : numberValue(row.min_dose || row.dose_min);
  const maxDose = hasProtocolDose ? exactDose : numberValue(row.max_dose || row.dose_max, minDose);
  const minTotal = weightValue * minDose;
  const maxTotal = weightValue * maxDose;
  const minVolume = row.concentration ? minTotal / numberValue(row.concentration) : null;
  const maxVolume = row.concentration ? maxTotal / numberValue(row.concentration) : null;
  const doseUnit = doseSetting?.dose_unit || row.dose_unit || "mg/kg";
  const totalUnit = doseUnit.split("/")[0] || "mg";
  const volumeText = minVolume ? `, ${formatDoseRange(minVolume, maxVolume)} ml` : "";
  return `${row.drug_name}: ${formatDoseRange(minTotal, maxTotal)} ${totalUnit}${volumeText}`;
}

const emergencyDrugKey = (row) => row ? `${normalise(row.drug_name)}|${normalise(row.indication)}` : "";

const emergencyDrugLabel = (row) => `${row?.drug_name || "Unnamed drug"} - ${row?.indication || "General"}`;

const numericOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const emergencyDoseText = (row) => {
  const minDose = numericOrNull(row?.dose_min);
  const maxDose = numericOrNull(row?.dose_max);
  if (minDose !== null || maxDose !== null) {
    const min = minDose ?? maxDose;
    const max = maxDose ?? minDose;
    return `${formatDoseRange(min, max)} ${row?.dose_unit || "mg/kg"}`;
  }
  return row?.dose_unit || "Dose guidance not recorded";
};

const hasCompleteEmergencyCalculationData = (row) => {
  const hasNumericDose = numericOrNull(row?.dose_min) !== null || numericOrNull(row?.dose_max) !== null;
  if (!hasNumericDose) return true;
  return Boolean(row?.species && row?.dose_unit && numericOrNull(row?.concentration) > 0);
};

const emergencyVariantLabel = (row, index) => {
  const route = row?.route || "Route not recorded";
  const concentration = row?.concentration ? `${row.concentration} ${row.concentration_unit || "mg/ml"}` : "No concentration";
  return `${route} - ${emergencyDoseText(row)} - ${concentration}${index > 0 ? ` (${index + 1})` : ""}`;
};

const emergencySpeciesOptions = ["All", "Dog", "Cat", "Rabbit", "Ferret", "Bird", "Reptile", "Small mammal", "Other"];

const matchesEmergencySpecies = (row, species) => {
  const rowSpecies = normalise(row?.species);
  const selectedSpecies = normalise(species);
  return !rowSpecies || rowSpecies === "all" || selectedSpecies === "all" || rowSpecies === selectedSpecies;
};

function EmergencyCalculator({ rows, darkMode, onLog, isOnline, offlineInteractions }) {
  const [weight, setWeight] = useState("");
  const [species, setSpecies] = useState("All");
  const [selectedKey, setSelectedKey] = useState(() => emergencyDrugKey(rows[0]));
  const [emergencySearch, setEmergencySearch] = useState("");
  const [doseSet, setDoseSet] = useState([]);
  const [summaryModal, setSummaryModal] = useState({ open: false, doses: [], interactions: [] });
  const filteredRows = useMemo(
    () => rows.filter((row) => matchesEmergencySpecies(row, species)),
    [rows, species]
  );
  const emergencyOptions = useMemo(() => {
    const groups = new Map();
    filteredRows.forEach((row) => {
      const key = emergencyDrugKey(row);
      if (!groups.has(key)) groups.set(key, row);
    });
    return Array.from(groups, ([key, row]) => ({ key, row }));
  }, [filteredRows]);
  const filteredEmergencySearchRows = useMemo(() => {
    const query = normalise(emergencySearch);
    if (!query) return [];
    return filteredRows
      .filter((row) => [row.drug_name, row.indication, row.route, row.dose_unit, row.notes].some((value) => normalise(value).includes(query)))
      .slice(0, 12);
  }, [emergencySearch, filteredRows]);

  useEffect(() => {
    if (!emergencyOptions.length) return;
    if (!selectedKey || !emergencyOptions.some((option) => option.key === selectedKey)) {
      setSelectedKey(emergencyOptions[0].key);
    }
  }, [emergencyOptions, selectedKey]);

  const weightValue = numberValue(weight);

  const buildEmergencyDoseSummary = (entry) => {
    const row = entry.row;
    const entryMinDose = numericOrNull(row?.dose_min);
    const entryMaxDose = numericOrNull(row?.dose_max);
    const entryHasNumericDose = entryMinDose !== null || entryMaxDose !== null;
    const entryConcentration = numericOrNull(row?.concentration);
    const entryDoseGuidance = emergencyDoseText(row);
    const entryDose = numberValue(entry.dose || entryMinDose || entryMaxDose);
    const entryTotalDose = weightValue * entryDose;
    const entryVolume = entryHasNumericDose && entryConcentration && entryConcentration > 0 ? entryTotalDose / entryConcentration : null;
    const totalUnit = row?.dose_unit?.split("/")[0] || "mg";
    const result = entryHasNumericDose
      ? `${row?.drug_name}: ${formatNumber(entryTotalDose)} ${totalUnit}${entryVolume ? `, give ${formatNumber(entryVolume)} ml` : ""}`
      : `${row?.drug_name}: ${entryDoseGuidance}. Check the dose guidance and calculate manually.`;
    return buildDoseSummary({
      name: row?.drug_name,
      route: row?.route,
      doseLabel: entryHasNumericDose ? `${formatNumber(entryDose)} ${row?.dose_unit || "mg/kg"}` : entryDoseGuidance,
      concentrationLabel: row?.concentration ? `${row.concentration} ${row.concentration_unit || "mg/ml"}` : "No concentration",
      result,
      guidance: entryHasNumericDose ? "" : "This emergency dose is text-only, check the dose guidance and calculate manually."
    });
  };

  const addEmergencyRowToSet = (row) => {
    if (!row) return toast.error("Select an emergency drug first");
    if (!hasCompleteEmergencyCalculationData(row)) {
      return toast.error("Cannot calculate this emergency drug: species, dose unit or concentration is missing");
    }
    const entryKey = `${row.id || emergencyDrugKey(row)}|${row.route || ""}|${row.concentration || ""}|${row.dose_min || ""}|${row.dose_max || ""}|${row.dose_unit || ""}`;
    if (doseSet.some((entry) => entry.entryKey === entryKey)) {
      toast.error("That emergency drug is already in this calculation set");
      return;
    }
    const rowMinDose = numericOrNull(row?.dose_min);
    const rowMaxDose = numericOrNull(row?.dose_max);
    const rowHasNumericDose = rowMinDose !== null || rowMaxDose !== null;
    setDoseSet((prev) => [
      ...prev,
      {
        entryId: `${entryKey}|${Date.now()}`,
        entryKey,
        row,
        dose: rowHasNumericDose ? String(rowMinDose ?? rowMaxDose ?? "") : ""
      }
    ]);
    setEmergencySearch("");
    toast.success("Emergency drug added to calculator");
  };

  const updateDoseSetDose = (entryId, value) => {
    setDoseSet((prev) => prev.map((entry) => entry.entryId === entryId ? { ...entry, dose: value } : entry));
  };

  const saveLog = async () => {
    if (weightValue <= 0 || doseSet.length === 0) return toast.error("Add a weight and at least one emergency drug");
    if (doseSet.some((entry) => !hasCompleteEmergencyCalculationData(entry.row))) {
      return toast.error("One or more emergency drugs are missing species, dose unit or concentration");
    }
    const entries = doseSet;
    const doseSummaries = entries.map(buildEmergencyDoseSummary);
    const result = doseSummaries.map((item) => item.result).join("; ");
    const drugNames = uniqueValues(doseSummaries.map((item) => item.name));
    let interactions = [];
    try {
      interactions = await fetchInteractionWarningsForDrugNames(drugNames, { isOnline, cachedInteractions: offlineInteractions });
    } catch {
      toast.error("Could not check interactions");
    }
    const logged = await onLog({ calculator_type: "emergency", drug_name: drugNames.join(", "), patient_weight: weightValue, result });
    if (logged === false) return;
    setSummaryModal({ open: true, doses: doseSummaries, interactions });
    toast.success("Emergency calculation logged");
  };

  return (
    <ToolShell darkMode={darkMode} title="Emergency Drug Calculator" icon={<Syringe size={20} />} subtitle="Fast weight-based emergency drug volumes.">
      <CalculationSummaryModal
        open={summaryModal.open}
        onClose={() => setSummaryModal({ open: false, doses: [], interactions: [] })}
        doses={summaryModal.doses}
        interactions={summaryModal.interactions}
        darkMode={darkMode}
        offlineData={!isOnline}
      />
      <select className={fieldClass(darkMode)} value={species} onChange={(event) => { setSpecies(event.target.value); setSelectedKey(""); setDoseSet([]); }}>
        {emergencySpeciesOptions.map((option) => <option key={option}>{option}</option>)}
      </select>
      <input className={fieldClass(darkMode)} type="number" placeholder="Patient weight kg" value={weight} onChange={(event) => setWeight(event.target.value)} />
      <div className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
        <h3 className="font-black mb-4 flex items-center gap-2"><Plus size={18} /> Add to Calculator</h3>
        <div className="relative mb-3">
          <Search size={17} className="absolute left-3 top-3.5 opacity-45" />
          <input
            className={`${fieldClass(darkMode)} pl-10`}
            placeholder="Search emergency drugs by name, indication or route..."
            value={emergencySearch}
            onChange={(event) => setEmergencySearch(event.target.value)}
          />
        </div>
        {emergencySearch.trim().length > 0 && (
          <div className="space-y-2 mb-3">
            {filteredEmergencySearchRows.length === 0 ? (
              <p className="text-sm opacity-55">No emergency drugs for this species.</p>
            ) : filteredEmergencySearchRows.map((row, index) => (
              <button
                key={`${row.id || emergencyDrugKey(row)}-${index}`}
                type="button"
                onClick={() => addEmergencyRowToSet(row)}
                disabled={!hasCompleteEmergencyCalculationData(row)}
                className={`w-full text-left rounded-lg p-3 border ${darkMode ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-[#DCEDEA] bg-white hover:bg-[#F0F6F5]"}`}
              >
                <div className="font-black text-sm">{emergencyDrugLabel(row)}</div>
                <div className="text-xs opacity-60">{emergencyVariantLabel(row, index)}</div>
                {!hasCompleteEmergencyCalculationData(row) && <div className="mt-1 text-xs font-bold text-amber-600">Unavailable for calculation: required concentration or units are missing.</div>}
              </button>
            ))}
          </div>
        )}
        <select className={fieldClass(darkMode)} defaultValue="" onChange={(event) => { addEmergencyRowToSet(filteredRows[Number(event.target.value)]); event.target.value = ""; }}>
          <option value="" disabled>Add single emergency drug...</option>
          {filteredRows.map((row, index) => <option key={`${row.id || emergencyDrugKey(row)}-${index}`} value={index} disabled={!hasCompleteEmergencyCalculationData(row)}>{emergencyDrugLabel(row)} ({row.route || "Route not recorded"})</option>)}
        </select>
      </div>

      {doseSet.length > 0 && (
        <div className={`rounded-lg border-2 border-[#71CFC2]/30 p-4 space-y-4 ${darkMode ? "bg-white/5" : "bg-white/90"}`}>
          <h3 className="font-black">Calculated Doses</h3>
          {doseSet.map((entry) => {
            const row = entry.row;
            const entryHasNumericDose = numericOrNull(row?.dose_min) !== null || numericOrNull(row?.dose_max) !== null;
            const summary = buildEmergencyDoseSummary(entry);
            return (
              <div key={entry.entryId} className="mb-4 pb-4 border-b border-slate-200 dark:border-white/10 last:border-0 last:mb-0 last:pb-0">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-bold">{row.drug_name}</div>
                  <button onClick={() => setDoseSet((prev) => prev.filter((item) => item.entryId !== entry.entryId))} className="text-red-400">
                    <X size={16} />
                  </button>
                </div>
                <div className="text-xs opacity-70 mb-2">{emergencyDrugLabel(row)} | {row.route || "Route not recorded"} | {summary.concentrationLabel}</div>
                {entryHasNumericDose ? (
                  <DoseRange row={{ ...row, min_dose: row.dose_min, max_dose: row.dose_max }} dose={entry.dose} setDose={(value) => updateDoseSetDose(entry.entryId, value)} darkMode={darkMode} />
                ) : (
                  <p className="text-sm leading-6 opacity-75">{summary.guidance}</p>
                )}
                <p className="mt-3 text-sm leading-6 font-bold text-[#0F8F83]">{summary.result}</p>
                <InfoLine label="Species" value={row.species || "All"} />
                <InfoLine label="Species notes" value={row.species_notes} />
                <InfoLine label="Species warning" value={row.species_warning_summary} />
                <Notes row={row} />
              </div>
            );
          })}
          <LogButton onClick={saveLog} label="Log all selected emergency doses" />
        </div>
      )}
    </ToolShell>
  );
}

function CriCalculator({ rows, darkMode, onLog }) {
  const [weight, setWeight] = useState("");
  const [selectedId, setSelectedId] = useState(rows[0]?.id || "");
  const [rate, setRate] = useState("");
  const selected = rows.find((row) => String(row.id) === String(selectedId)) || rows[0];

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(String(selected.id));
  }, [selected, selectedId]);

  useEffect(() => {
    if (selected) setRate(selected.cri_rate_min || selected.cri_rate_max || "");
  }, [selected?.id]);

  const weightValue = numberValue(weight);
  const rateValue = numberValue(rate || selected?.cri_rate_min);
  const unit = String(selected?.rate_unit || "").toLowerCase();
  const criReady = Boolean(selected?.rate_unit && rateValue > 0 && numberValue(selected?.concentration, 0) > 0);
  let mgPerHour = 0;

  if (unit.includes("mcg") && unit.includes("min")) mgPerHour = (weightValue * rateValue / 1000) * 60;
  else if (unit.includes("mcg") && unit.includes("hr")) mgPerHour = weightValue * rateValue / 1000;
  else if (unit.includes("mg") && unit.includes("min")) mgPerHour = weightValue * rateValue * 60;
  else mgPerHour = weightValue * rateValue;

  const mgPerMin = mgPerHour / 60;
  const mlPerHour = selected?.concentration ? mgPerHour / numberValue(selected.concentration) : null;

  const saveLog = () => {
    if (!selected || weightValue <= 0) return toast.error("Add a weight and select a CRI");
    if (!criReady) return toast.error("Cannot calculate this CRI: rate, rate unit or concentration is missing");
    const result = `${formatNumber(mgPerHour)} mg/hr${mlPerHour ? `, ${formatNumber(mlPerHour)} ml/hr` : ""}`;
    onLog({ calculator_type: "cri", drug_name: selected.drug_name, patient_weight: weightValue, result });
    toast.success("CRI calculation logged");
  };

  return (
    <ToolShell darkMode={darkMode} title="CRI Calculator" icon={<Activity size={20} />} subtitle="Calculate continuous rate infusion delivery rates.">
      <input className={fieldClass(darkMode)} type="number" placeholder="Patient weight kg" value={weight} onChange={(event) => setWeight(event.target.value)} />
      <select className={fieldClass(darkMode)} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
        {rows.length === 0 && <option value="">No CRI protocols loaded</option>}
        {rows.map((row) => <option key={row.id} value={row.id}>{row.drug_name} {row.indication ? `- ${row.indication}` : ""}</option>)}
      </select>
      {selected && (
        <>
          {criReady ? (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
                <input className={fieldClass(darkMode)} type="number" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="CRI rate" />
                <span className="text-sm font-black opacity-70">{selected.rate_unit}</span>
              </div>
              <ResultGrid items={[
                ["mg/min", `${formatNumber(mgPerMin, 3)} mg/min`],
                ["mg/hr", `${formatNumber(mgPerHour)} mg/hr`],
                ["Pump rate", `${formatNumber(mlPerHour)} ml/hr`]
              ]} />
            </>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
              Cannot calculate this CRI because its rate, rate unit or concentration is missing.
            </p>
          )}
          <InfoLine label="Loading dose" value={selected.loading_dose} />
          <InfoLine label="Dilution" value={selected.dilution} />
          <InfoLine label="Monitoring" value={selected.monitoring} />
          <Notes row={selected} />
          {criReady && <LogButton onClick={saveLog} />}
        </>
      )}
    </ToolShell>
  );
}

function FluidCalculator({ rows, darkMode, onLog }) {
  const [species, setSpecies] = useState("Dog");
  const [weight, setWeight] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const speciesRows = rows.filter((row) => !row.species || row.species === species);
  const selected = speciesRows.find((row) => String(row.id) === String(selectedId)) || speciesRows[0];

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(String(selected.id));
  }, [selected, selectedId]);

  const weightValue = numberValue(weight);
  const multiplier = parseFormulaMultiplier(selected?.formula);
  const volume = weightValue * multiplier;
  const hourly = volume / 24;

  const saveLog = () => {
    if (!selected || weightValue <= 0) return toast.error("Add a weight and select a fluid calculation");
    const result = `${formatNumber(volume)} ml total${selected.calculation_name?.toLowerCase().includes("maintenance") ? `, ${formatNumber(hourly)} ml/hr` : ""}`;
    onLog({ calculator_type: "fluid", drug_name: selected.calculation_name, patient_weight: weightValue, result });
    toast.success("Fluid calculation logged");
  };

  return (
    <ToolShell darkMode={darkMode} title="Fluid Therapy Calculator" icon={<Droplets size={20} />} subtitle="Calculate maintenance and shock fluid volumes.">
      <SpeciesWeight species={species} setSpecies={(value) => { setSpecies(value); setSelectedId(""); }} weight={weight} setWeight={setWeight} darkMode={darkMode} />
      <select className={fieldClass(darkMode)} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
        {speciesRows.length === 0 && <option value="">No fluid formulas loaded</option>}
        {speciesRows.map((row) => <option key={row.id} value={row.id}>{row.calculation_name} ({row.formula})</option>)}
      </select>
      {selected && (
        <>
          <ResultGrid items={[
            ["Volume", `${formatNumber(volume)} ml`],
            ["Hourly", selected.calculation_name?.toLowerCase().includes("maintenance") ? `${formatNumber(hourly)} ml/hr` : "Not maintenance"]
          ]} />
          <InfoLine label="Formula" value={selected.formula} />
          <Notes row={selected} />
          <LogButton onClick={saveLog} />
        </>
      )}
    </ToolShell>
  );
}

function TransfusionCalculator({ rows, darkMode, onLog }) {
  const [species, setSpecies] = useState("Dog");
  const [weight, setWeight] = useState("");
  const [currentPcv, setCurrentPcv] = useState("");
  const [targetPcv, setTargetPcv] = useState("");
  const [donorPcv, setDonorPcv] = useState("60");
  const selected = rows.find((row) => row.species === species) || rows[0];

  const volume = numberValue(weight) * numberValue(selected?.blood_volume_factor) * (numberValue(targetPcv) - numberValue(currentPcv)) / Math.max(numberValue(donorPcv), 1);

  const saveLog = () => {
    if (!selected || numberValue(weight) <= 0) return toast.error("Add weight and PCV values");
    const result = `${formatNumber(Math.max(volume, 0))} ml blood product`;
    onLog({ calculator_type: "transfusion", drug_name: `${species} transfusion`, patient_weight: numberValue(weight), result });
    toast.success("Transfusion calculation logged");
  };

  return (
    <ToolShell darkMode={darkMode} title="Blood Transfusion Calculator" icon={<HeartPulse size={20} />} subtitle="Estimate transfusion volume from blood volume factor and PCV change.">
      <SpeciesWeight species={species} setSpecies={setSpecies} weight={weight} setWeight={setWeight} darkMode={darkMode} />
      <div className="grid grid-cols-3 gap-3">
        <input className={fieldClass(darkMode)} type="number" placeholder="Current PCV" value={currentPcv} onChange={(event) => setCurrentPcv(event.target.value)} />
        <input className={fieldClass(darkMode)} type="number" placeholder="Target PCV" value={targetPcv} onChange={(event) => setTargetPcv(event.target.value)} />
        <input className={fieldClass(darkMode)} type="number" placeholder="Donor PCV" value={donorPcv} onChange={(event) => setDonorPcv(event.target.value)} />
      </div>
      <ResultGrid items={[["Volume", `${formatNumber(Math.max(volume, 0))} ml`], ["Factor", selected?.blood_volume_factor ? `${selected.blood_volume_factor} ml/kg` : "Not loaded"]]} />
      <Notes row={selected} />
      <LogButton onClick={saveLog} />
    </ToolShell>
  );
}

function Toxicology({ rows, darkMode }) {
  const [search, setSearch] = useState("");
  const [species, setSpecies] = useState("All");

  const filtered = rows.filter((row) => {
    const matchesSpecies = species === "All" || row.species === species;
    const q = search.toLowerCase().trim();
    const matchesSearch = !q || [row.toxin, row.species, row.toxic_dose, row.clinical_signs, row.antidote, row.notes].some((value) => String(value || "").toLowerCase().includes(q));
    return matchesSpecies && matchesSearch;
  });

  return (
    <ToolShell darkMode={darkMode} title="Species Toxicities" icon={<ShieldAlert size={20} />} subtitle="Search common toxicities, signs and antidotes.">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={17} className="absolute left-3 top-3.5 opacity-45" />
          <input className={`${fieldClass(darkMode)} pl-10`} placeholder="Search toxin, signs or antidote..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select className={`${fieldClass(darkMode)} max-w-[120px]`} value={species} onChange={(event) => setSpecies(event.target.value)}>
          <option>All</option>
          {speciesOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <p className="text-sm opacity-60">No toxicology records found.</p>}
        {filtered.map((row) => (
          <div key={row.id} className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="font-black text-lg">{row.toxin}</h3>
                <p className="text-sm opacity-65">{row.species}</p>
              </div>
              <AlertTriangle size={18} className="text-amber-500 shrink-0" />
            </div>
            <InfoLine label="Toxic dose" value={row.toxic_dose} />
            <InfoLine label="Clinical signs" value={row.clinical_signs} />
            <InfoLine label="Antidote" value={row.antidote} />
            <Notes row={row} />
          </div>
        ))}
      </div>
    </ToolShell>
  );
}

function CalculationHistory({ rows, loading, darkMode, onRefresh }) {
  const [query, setQuery] = useState("");
  const filteredRows = useMemo(() => {
    const search = normalise(query);
    if (!search) return rows;
    return rows.filter((row) => [
      row.drug_name,
      row.calculator_type,
      readableCalculatorType(row.calculator_type),
      row.patient_weight,
      row.result,
      row.created_at
    ].some((value) => normalise(value).includes(search)));
  }, [query, rows]);

  const printHistory = async () => {
    if (!filteredRows.length) {
      toast.error("No calculation history to print");
      return;
    }
    await exportCalculationHistoryPdf(filteredRows);
  };

  return (
    <ToolShell darkMode={darkMode} title="Calculation History" icon={<Clock size={20} />} subtitle="Calculations logged from Clinical Tools in the last 72 hours.">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm opacity-60">{filteredRows.length} of {rows.length} calculation{rows.length === 1 ? "" : "s"} in the last 72 hours</p>
          <button onClick={onRefresh} className="rounded-lg bg-[#E8F8F5] text-[#0B3760] px-3 py-2 text-xs font-black">
            Refresh
          </button>
        </div>
        <label className={`flex items-center gap-2 rounded-lg px-3 py-3 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
          <Search size={18} className="opacity-55" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search calculations..."
            className="bg-transparent outline-none flex-1 text-sm"
          />
        </label>
        <button onClick={printHistory} className={`p-2 rounded-lg font-bold flex gap-2 items-center ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
          <Printer size={16} /> Print PDF
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><HeartbeatLoader size={48} /></div>
      ) : rows.length === 0 ? (
        <div className={`rounded-lg border p-4 text-center text-sm opacity-65 ${darkMode ? "border-white/10 bg-white/5" : "border-[#DCEDEA] bg-[#F9FCFB]"}`}>
          No calculations logged in the last 72 hours.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className={`rounded-lg border p-4 text-center text-sm opacity-65 ${darkMode ? "border-white/10 bg-white/5" : "border-[#DCEDEA] bg-[#F9FCFB]"}`}>
          No calculations match that search.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((row) => (
            <div key={row.id} className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <h3 className="font-black text-base truncate">{row.drug_name || readableCalculatorType(row.calculator_type)}</h3>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-45">{readableCalculatorType(row.calculator_type)}</p>
                </div>
                <span className="text-xs font-bold opacity-55 whitespace-nowrap">{new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="text-sm leading-6 font-bold text-[#0F8F83]">{row.result}</p>
              {row.patient_weight && <p className="text-xs opacity-55 mt-2">Patient weight: {row.patient_weight} kg</p>}
            </div>
          ))}
        </div>
      )}
    </ToolShell>
  );
}

function readableCalculatorType(type) {
  const labels = {
    drug: "Drug Calculator",
    protocol: "Protocol Calculator",
    emergency: "Emergency Drugs",
    fluid: "Fluid Therapy",
    transfusion: "Blood Transfusion",
    cri: "CRI Calculator"
  };
  return labels[type] || "Calculator";
}

function OfflineCalculatorBanner({ darkMode, lastUpdated }) {
  return (
    <div className={`rounded-lg border p-4 text-sm ${darkMode ? "bg-[#71CFC2]/10 border-[#71CFC2]/20 text-slate-200" : "bg-[#E8F8F5] border-[#BDE8E1] text-[#0B3760]"}`}>
      <div className="flex items-center gap-2 font-black"><WifiOff size={16} /> Offline mode: using saved calculator data</div>
      {lastUpdated && <p className="mt-1 text-xs opacity-60">Last updated {formatCacheDate(lastUpdated)}.</p>}
      <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">Offline data may be incomplete. Check latest formulary when online.</p>
    </div>
  );
}

function MissingOfflineCalculatorData({ darkMode }) {
  return (
    <section className={`${panelClass(darkMode)} text-center py-10`}>
      <WifiOff className="mx-auto mb-3 text-[#0F8F83]" size={30} />
      <h2 className="font-black text-lg">Saved calculator data is not available yet</h2>
      <p className="mt-2 text-sm opacity-65">This calculator needs saved data before it can be used offline. Open it while online first.</p>
    </section>
  );
}

function ToolShell({ darkMode, title, subtitle, icon, children }) {
  return (
    <section className={`${panelClass(darkMode)} space-y-4`}>
      <div className="flex items-start gap-3">
        <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3 shrink-0`}>{icon}</div>
        <div>
          <h2 className="font-black text-xl leading-tight">{title}</h2>
          <p className="text-sm opacity-60 leading-6">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SpeciesWeight({ species, setSpecies, weight, setWeight, darkMode }) {
  return (
    <div className="grid grid-cols-[1fr_1fr] gap-3">
      <select className={fieldClass(darkMode)} value={species} onChange={(event) => setSpecies(event.target.value)}>
        {speciesOptions.map((option) => <option key={option}>{option}</option>)}
      </select>
      <input className={fieldClass(darkMode)} type="number" placeholder="Weight kg" value={weight} onChange={(event) => setWeight(event.target.value)} />
    </div>
  );
}

function DoseRange({ row, dose, setDose, darkMode }) {
  const min = numberValue(row.min_dose || row.dose_min);
  const max = Math.max(numberValue(row.max_dose || row.dose_max, min), min || 1);
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-3 text-xs font-black uppercase tracking-widest opacity-55">
        <span>Dose rate</span>
        <span>{row.dose_unit || "mg/kg"}</span>
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-3 items-center">
        <input type="range" min={min} max={max} step="0.01" value={dose || min} onChange={(event) => setDose(event.target.value)} className="accent-[#71CFC2]" />
        <input className={`${fieldClass(darkMode)} text-center`} type="number" step="0.01" value={dose} onChange={(event) => setDose(event.target.value)} />
      </div>
      <p className="text-xs opacity-55">Range: {row.min_dose || row.dose_min} - {row.max_dose || row.dose_max} {row.dose_unit || "mg/kg"}</p>
    </div>
  );
}

function ResultGrid({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-[#0F8F83]/10 text-[#0B3760] dark:text-[#71CFC2] p-4 text-center">
          <div className="text-xs font-black uppercase tracking-widest opacity-60 mb-1">{label}</div>
          <div className="font-black text-xl">{value}</div>
        </div>
      ))}
    </div>
  );
}

function InfoLine({ label, value }) {
  if (!value) return null;
  return <p className="text-sm leading-6"><span className="font-black opacity-60">{label}: </span>{value}</p>;
}

function Notes({ row }) {
  if (!row?.notes) return null;
  return <p className="text-sm leading-6 opacity-70"><span className="font-black">Notes: </span>{row.notes}</p>;
}

function LogButton({ onClick, label = "Log calculation" }) {
  return <button onClick={onClick} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black flex items-center justify-center gap-2"><Beaker size={18} /> {label}</button>;
}

function parseFormulaMultiplier(formula) {
  const text = String(formula || "").toLowerCase();
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:x|\*)\s*bw/);
  if (match) return numberValue(match[1]);
  const leading = text.match(/^([0-9]+(?:\.[0-9]+)?)/);
  return leading ? numberValue(leading[1]) : 0;
}
