import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import { 
  Syringe, Plus, Trash2, Loader2, Save, Printer, History as HistoryIcon, 
  Search, Globe, User as UserIcon, X, ChevronDown, ChevronRight, 
  AlertTriangle, Ban, RefreshCw, TestTubes, PawPrint, Activity, Baby, Tag, 
  FileText, Info, Share2, Pill, Stethoscope, ShieldAlert, Copy, Star, Clock, BookOpen, Lightbulb
} from "lucide-react";
import { exportDrugHistory } from "../utils/drugsPdfExport";
import HeartbeatLoader from "../components/HeartbeatLoader";

// ============================================================================
// UTILITY: BULLETPROOF MATH PARSER
// ============================================================================
const parseSafeNumber = (val, fallback = 0) => {
  try {
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (val === null || val === undefined || val === '') return fallback;
    const str = String(val);
    const match = str.match(/\d+(\.\d+)?/); 
    if (match) {
      const num = parseFloat(match[0]);
      return isNaN(num) ? fallback : num;
    }
    return fallback;
  } catch (e) {
    return fallback;
  }
};

// ============================================================================
// CONFIGURATION: FORMULARY SECTIONS (Mapped to Tabs)
// ============================================================================
const MONOGRAPH_CONFIG = {
  safety: [
    { key: "warnings", title: "Warnings & Precautions", icon: ShieldAlert, colorClass: "amber", bgDark: "bg-amber-900/10", borderDark: "border-amber-800/30", textDark: "text-amber-300" },
    { key: "contraindications", title: "Contraindications", icon: Ban, colorClass: "red", bgDark: "bg-red-900/10", borderDark: "border-red-800/30", textDark: "text-red-300" },
    { key: "speciesWarnings", title: "Species Warnings", icon: PawPrint, colorClass: "slate", bgDark: "bg-slate-800/10", borderDark: "border-slate-700/30", textDark: "text-slate-300" },
    { key: "adverseEffects", title: "Adverse Effects", icon: AlertTriangle, colorClass: "orange", bgDark: "bg-orange-900/10", borderDark: "border-orange-800/30", textDark: "text-orange-300" },
    { key: "interactions", title: "Drug Interactions", icon: RefreshCw, colorClass: "blue", bgDark: "bg-blue-900/10", borderDark: "border-blue-800/30", textDark: "text-blue-300" }
  ],
  monitoring: [
    { key: "monitoring", title: "Monitoring Recommendations", icon: TestTubes, colorClass: "emerald", bgDark: "bg-emerald-900/10", borderDark: "border-emerald-800/30", textDark: "text-emerald-300" },
    { key: "dosageMonitoring", title: "Dosage Monitoring", icon: Activity, colorClass: "teal", bgDark: "bg-teal-900/10", borderDark: "border-teal-800/30", textDark: "text-teal-300" },
    { key: "renalAdjustments", title: "Renal Adjustments", icon: Activity, colorClass: "purple", bgDark: "bg-purple-900/10", borderDark: "border-purple-800/30", textDark: "text-purple-300" },
    { key: "hepaticAdjustments", title: "Hepatic Adjustments", icon: Activity, colorClass: "orange", bgDark: "bg-orange-900/10", borderDark: "border-orange-800/30", textDark: "text-orange-300" },
    { key: "reproductiveGuidance", title: "Pregnancy & Lactation", icon: Baby, colorClass: "pink", bgDark: "bg-pink-900/10", borderDark: "border-pink-800/30", textDark: "text-pink-300" }
  ],
  pharmacology: [
    { key: "drugInformation.mechanism", title: "Mechanism of Action", icon: Pill, colorClass: "indigo", bgDark: "bg-indigo-900/10", borderDark: "border-indigo-800/30", textDark: "text-indigo-300" },
    { key: "drugInformation.clinicalNotes", title: "Clinical Notes", icon: Stethoscope, colorClass: "slate", bgDark: "bg-white/5", borderDark: "border-white/10", textDark: "text-slate-300" },
    { key: "drugInformation.administrationAdvice", title: "Administration Advice", icon: Info, colorClass: "cyan", bgDark: "bg-cyan-900/10", borderDark: "border-cyan-800/30", textDark: "text-cyan-300" },
    { key: "drugInformation.pharmacokinetics", title: "Pharmacokinetics", icon: Activity, colorClass: "sky", bgDark: "bg-sky-900/10", borderDark: "border-sky-800/30", textDark: "text-sky-300" },
    { key: "drugInformation.evidenceNotes", title: "Evidence Notes", icon: FileText, colorClass: "slate", bgDark: "bg-white/5", borderDark: "border-white/10", textDark: "text-slate-300" }
  ]
};

// ============================================================================
// UI COMPONENTS
// ============================================================================

const ClinicalCard = React.memo(({ item, config, darkMode }) => {
  const title = item.warning || item.warning_text || item.title || item.contraindication || item.condition || item.name || item.drug_b || item.interacting_drug || item.parameter || item.species;
  const description = item.description || item.details || item.text || item.notes || item.interaction || item.mechanism || item.rationale || item.pearl;
  
  const baseClasses = "mb-3 p-4 rounded-xl border";
  const lightClasses = `border-${config.colorClass}-200 bg-${config.colorClass}-50 text-${config.colorClass}-900`;
  const darkClasses = `${config.borderDark} ${config.bgDark} text-${config.colorClass}-100`;

  return (
    <div className={`${baseClasses} ${darkMode ? darkClasses : lightClasses}`}>
      {title && <div className={`font-black ${darkMode ? config.textDark : `text-${config.colorClass}-800`} uppercase tracking-wider text-xs mb-1`}>{title}</div>}
      {description && <div className="text-sm mt-1">{description}</div>}
      {item.recommendation && <div className="text-sm mt-2 font-semibold">Action: {item.recommendation}</div>}
      {item.frequency && <div className="text-sm mt-1 font-semibold">Frequency: {item.frequency}</div>}
      {item.severity && <div className="text-[10px] uppercase tracking-widest mt-2 font-bold opacity-70">Severity: {item.severity}</div>}
    </div>
  );
});

const AccordionSection = React.memo(({ id, title, icon: Icon, iconColor, expandedSection, onToggle, darkMode, children }) => {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  const isOpen = expandedSection === id;
  
  return (
    <div className={`border-b ${darkMode ? "border-white/10" : "border-slate-200"} last:border-0`}>
      <button 
        onClick={() => onToggle(id)}
        className={`w-full flex items-center justify-between py-4 text-left transition-colors ${isOpen ? (darkMode ? "text-[#71CFC2]" : "text-[#0F8F83]") : (darkMode ? "text-white" : "text-[#113247]")}`}
      >
        <div className="flex items-center gap-3 font-black text-[15px]">
          {Icon && <Icon size={20} className={iconColor || (darkMode ? "text-[#71CFC2]" : "text-[#0F8F83]")} />}
          {title}
        </div>
        {isOpen ? <ChevronDown size={20} className="opacity-50"/> : <ChevronRight size={20} className="opacity-50" />}
      </button>
      {isOpen && (
        <div className="pb-5 animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
});

const NestedDose = React.memo(({ species, spDoses, user, deleteDrug, darkMode }) => {
  const routes = [...new Set(spDoses.map(d => d.route || "General"))];
  
  const [openRoutes, setOpenRoutes] = useState(() => {
    const initialState = {};
    routes.forEach(route => { initialState[route] = true; });
    return initialState;
  });

  useEffect(() => {
    const initialState = {};
    routes.forEach(route => { initialState[route] = true; });
    setOpenRoutes(initialState);
  }, [spDoses]);

  const toggleRoute = (route) => {
    setOpenRoutes(prev => ({ ...prev, [route]: !prev[route] }));
  };

  return (
    <div className={`mb-4 rounded-xl overflow-hidden border ${darkMode ? "border-white/10 bg-black/20" : "border-slate-100 bg-white shadow-sm"}`}>
      <div className={`px-4 py-3 font-bold text-sm uppercase tracking-widest border-b ${darkMode ? "border-white/10 text-slate-300" : "border-slate-100 text-slate-500"}`}>
        {species}
      </div>
      <div className="p-0">
        {routes.map((route, i) => {
          const routeDoses = spDoses.filter(d => (d.route || "General") === route);
          const isOpen = openRoutes[route];
          
          return (
            <div key={route} className={`${i !== 0 ? "border-t" : ""} ${darkMode ? "border-white/5" : "border-slate-100"}`}>
              <button 
                onClick={() => toggleRoute(route)} 
                className="w-full flex items-center justify-between p-4 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                <span className={`font-bold ${darkMode ? "text-[#71CFC2]" : "text-[#0F8F83]"}`}>├─ {route}</span>
                {isOpen ? <ChevronDown size={16} className="opacity-50"/> : <ChevronRight size={16} className="opacity-50"/>}
              </button>
              
              {isOpen && (
                <div className={`p-4 pt-0 space-y-3 ${darkMode ? "bg-transparent" : "bg-slate-50"}`}>
                  {routeDoses.map(dose => (
                    <div key={dose.id} className={`p-4 rounded-lg border ${darkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="text-xl font-black text-[#113247] dark:text-white mb-1">
                            {dose.dose_min} {dose.dose_min !== dose.dose_max ? `- ${dose.dose_max}` : ''} mg/kg
                          </div>
                          
                          <div className="flex flex-wrap gap-2 mb-3">
                            <span className={`text-xs px-2 py-1 rounded font-bold ${darkMode ? "bg-[#71CFC2]/20 text-[#71CFC2]" : "bg-[#0F8F83]/10 text-[#0F8F83]"}`}>
                              Route: {dose.route || "General"}
                            </span>
                            {dose.concentration && (
                              <span className={`text-xs px-2 py-1 rounded font-bold ${darkMode ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                                Conc: {dose.concentration} mg/ml
                              </span>
                            )}
                          </div>
                          
                          {dose.notes && (
                            <div className={`text-sm mt-2 p-3 rounded-lg ${darkMode ? "bg-black/20 text-slate-300" : "bg-slate-50 text-slate-600"}`}>
                              <span className="font-bold opacity-70 block mb-1 uppercase tracking-widest text-[10px]">Notes</span> 
                              {dose.notes}
                            </div>
                          )}
                        </div>
                        
                        {dose.user_id === user.id && (
                          <button 
                            onClick={() => deleteDrug(dose.id)} 
                            className={`shrink-0 p-2 rounded-lg text-red-400 transition ${darkMode ? "hover:bg-red-500/20" : "hover:bg-red-50"}`}
                            title="Delete custom dose"
                          >
                            <Trash2 size={16}/>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  );
});

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
export default function Drugs({ user, darkMode = false }) {
  const [activeTab, setActiveTab] = useState("library");
  
  // Database States
  const [drugs, setDrugs] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [allAliases, setAllAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Monograph Modal States
  const [monographOpen, setMonographOpen] = useState(false);
  const [activeMonographTab, setActiveMonographTab] = useState("overview"); // Modal Inner Tabs
  const [activeMonographName, setActiveMonographName] = useState("");
  const [activeMonographDoses, setActiveMonographDoses] = useState([]);
  const [activeSummary, setActiveSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [expandedSection, setExpandedSection] = useState("dosing");
  
  // Caching & Local Storage
  const [monographCache, setMonographCache] = useState({});
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [favourites, setFavourites] = useState([]);

  // Search & Calculator States
  const [drugSearch, setDrugSearch] = useState("");
  const [protocolSearch, setProtocolSearch] = useState("");
  const [protoDrugSearch, setProtoDrugSearch] = useState("");
  
  const [calcPatient, setCalcPatient] = useState({ name: "", weight: "", species: "Dog" });
  const [selectedCalcDrugs, setSelectedCalcDrugs] = useState([]); 
  const [history, setHistory] = useState([]);

  // Interaction Checker States
  const [checkingInteractions, setCheckingInteractions] = useState(false);
  const [interactionDrugA, setInteractionDrugA] = useState("");
  const [interactionDrugB, setInteractionDrugB] = useState("");
  const [interactionResults, setInteractionResults] = useState(null);

  // Network Sharing State (Protocols)
  const [sharingProtocol, setSharingProtocol] = useState(null);
  const [friendsList, setFriendsList] = useState([]);
  const [isSharingLoading, setIsSharingLoading] = useState(false);
  const [shareBusyId, setShareBusyId] = useState(null);

  // Forms
  const [showAddDrug, setShowAddDrug] = useState(false);
  const [drugForm, setDrugForm] = useState({ 
    name: "", species: "Dog", concentration: "", dose_min: "", dose_max: "", route: "", category: "Analgesic" 
  });
  const [protocolForm, setProtocolForm] = useState({ name: "", drug_ids: [] });

  const fieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247]"}`;
  const panelClass = darkMode ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]" : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  // --- Initial Load ---
  useEffect(() => {
    loadDatabase();
    setRecentlyViewed(JSON.parse(localStorage.getItem("vetlearn-recent-drugs") || "[]"));
    setFavourites(JSON.parse(localStorage.getItem("vetlearn-fav-drugs") || "[]"));
    loadLocalHistory();
  }, [user]);

  const loadDatabase = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [drugsRes, protoRes, aliasesRes] = await Promise.all([
        supabase.from("drugs").select("*").or(`user_id.is.null,user_id.eq.${user.id}`).eq("active", true).order("name"),
        supabase.from("protocols").select("*").or(`user_id.is.null,user_id.eq.${user.id}`).order("name"),
        supabase.from("drug_aliases").select("*")
      ]);
      setDrugs(drugsRes.data || []);
      setProtocols(protoRes.data || []);
      setAllAliases(aliasesRes.data || []);
    } catch (e) {
      toast.error("Failed to load database");
    } finally {
      setLoading(false);
    }
  };

  const loadLocalHistory = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("euthapp-drug-history") || "[]");
      if(Array.isArray(saved)) {
         const validHistory = saved.filter(item => item.timestamp > (Date.now() - (24 * 60 * 60 * 1000)));
         setHistory(validHistory);
         localStorage.setItem("euthapp-drug-history", JSON.stringify(validHistory));
      } else {
         setHistory([]);
      }
    } catch (e) {
      setHistory([]);
    }
  };

  const saveToHistory = () => {
    const weight = parseSafeNumber(calcPatient.weight, 0);
    if (weight <= 0) { toast.error("Enter a valid patient weight"); return; }
    if (selectedCalcDrugs.length === 0) { toast.error("Add drugs to calculate"); return; }
    
    const calculatedData = selectedCalcDrugs.map(d => {
      const dose = parseSafeNumber(d.selectedDose, 0);
      const totalMg = (dose * weight).toFixed(2);
      
      const conc = parseSafeNumber(d.concentration, 0);
      const totalMl = (conc > 0) ? (parseFloat(totalMg) / conc).toFixed(2) : null;
      
      return { ...d, totalMg, totalMl };
    });

    const newRecord = {
      id: Date.now().toString(), timestamp: Date.now(), patientName: calcPatient.name, 
      weight: weight, species: calcPatient.species, calculatedDrugs: calculatedData
    };

    const newHistory = [newRecord, ...history];
    setHistory(newHistory);
    localStorage.setItem("euthapp-drug-history", JSON.stringify(newHistory));
    toast.success("Saved to 24h History");
    setSelectedCalcDrugs([]);
    setCalcPatient({ name: "", weight: "", species: calcPatient.species });
  };

  // --- Formulary Monograph Loader (Promise.all) ---
  const openMonograph = useCallback(async (drugName) => {
    if (!drugName) return;
    const formattedName = drugName.toLowerCase();
    setActiveMonographName(drugName);
    setActiveMonographTab("overview");
    setExpandedSection("dosing");
    
    // Manage Recently Viewed
    const updatedRecent = [drugName, ...recentlyViewed.filter(n => n !== drugName)].slice(0, 5);
    setRecentlyViewed(updatedRecent);
    localStorage.setItem("vetlearn-recent-drugs", JSON.stringify(updatedRecent));

    const doses = drugs.filter(d => d.name && d.name.toLowerCase() === formattedName);
    setActiveMonographDoses(doses);
    setMonographOpen(true);

    // FIXED ISSUE #1: Query by drugNames instead of drugIds
    const drugNames = [...new Set(doses.map(d => d.name))];
    const drugIds = doses.map(d => d.id);
    if (drugNames.length === 0) return;

    // Use Cache if available
    if (monographCache[formattedName]) {
      setActiveSummary(monographCache[formattedName]);
      return;
    }

    setLoadingSummary(true);
    setActiveSummary(null);

    try {
      const [
        { data: aliasesData }, { data: warningsData }, { data: contraData },
        { data: interactionsData }, { data: monitoringData }, { data: renalData },
        { data: hepaticData }, { data: reproData }, { data: speciesWarnData },
        { data: dosageMonData }, { data: drugInfoData }, { data: adverseData },
        { data: pearlsData }
      ] = await Promise.all([
        supabase.from('drug_aliases').select('*').in('drug_id', drugIds),
        supabase.from('drug_warnings').select('*').in('drug_name', drugNames),
        supabase.from('contraindications').select('*').in('drug_name', drugNames),
        supabase.from('drug_interactions').select('*').in('drug_name', drugNames), // Adjust based on your schema
        supabase.from('monitoring_recommendations').select('*').in('drug_name', drugNames),
        supabase.from('renal_adjustments').select('*').in('drug_name', drugNames),
        supabase.from('hepatic_adjustments').select('*').in('drug_name', drugNames),
        supabase.from('reproductive_guidance').select('*').in('drug_name', drugNames),
        supabase.from('species_warnings').select('*').in('drug_name', drugNames),
        supabase.from('dosage_monitoring').select('*').in('drug_name', drugNames),
        supabase.from('drug_information').select('*').in('drug_name', drugNames),
        supabase.from('adverse_effects').select('*').in('drug_name', drugNames),
        supabase.from('clinical_pearls').select('*').in('drug_name', drugNames)
      ]);

      // FIXED ISSUE #2 & #3: Using d.section and adding clinicalPearls
      const summary = {
        aliases: aliasesData || [],
        warnings: warningsData || [],
        contraindications: contraData || [],
        interactions: interactionsData || [],
        monitoring: monitoringData || [],
        renalAdjustments: renalData || [],
        hepaticAdjustments: hepaticData || [],
        reproductiveGuidance: reproData || [],
        speciesWarnings: speciesWarnData || [],
        dosageMonitoring: dosageMonData || [],
        adverseEffects: adverseData || [],
        clinicalPearls: pearlsData || [],
        drugInformation: {
          mechanism: drugInfoData?.filter(d => d.section === 'Mechanism of Action') || [],
          clinicalNotes: drugInfoData?.filter(d => d.section === 'Clinical Notes') || [],
          administrationAdvice: drugInfoData?.filter(d => d.section === 'Administration Advice') || [],
          pharmacokinetics: drugInfoData?.filter(d => d.section === 'Pharmacokinetics') || [],
          evidenceNotes: drugInfoData?.filter(d => d.section === 'Evidence Notes') || [],
          other: drugInfoData?.filter(d => !['Mechanism of Action', 'Clinical Notes', 'Administration Advice', 'Pharmacokinetics', 'Evidence Notes'].includes(d.section)) || []
        }
      };

      setMonographCache(prev => ({ ...prev, [formattedName]: summary }));
      setActiveSummary(summary);

    } catch (err) {
      toast.error("Error fetching clinical summary.");
    } finally {
      setLoadingSummary(false);
    }
  }, [drugs, monographCache, recentlyViewed]);

  // --- Search & Library Logic ---
  const uniqueDrugsList = useMemo(() => {
    const uniqueDrugsMap = new Map();
    drugs.forEach(d => {
      if (!d.name) return;
      const key = d.name.toLowerCase();
      if (!uniqueDrugsMap.has(key)) { 
        const aliasesForDrug = allAliases.filter(a => String(a.drug_id) === String(d.id) || a.drug_name?.toLowerCase() === key).map(a => a.alias);
        uniqueDrugsMap.set(key, { 
          id: d.id,
          name: d.name, 
          category: d.category || "Uncategorized", 
          search_terms: d.search_terms || [], 
          aliases: aliasesForDrug,
          indication: d.indication || "",
          isCustom: d.user_id === user.id 
        }); 
      } else if (d.user_id === user.id) { 
        uniqueDrugsMap.get(key).isCustom = true; 
      }
    });
    return Array.from(uniqueDrugsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [drugs, allAliases, user.id]);

const filteredLibrary = useMemo(() => {
  const q = drugSearch.toLowerCase();
  if (!q) return uniqueDrugsList;
  return uniqueDrugsList.filter(d =>
    d.name.toLowerCase().includes(q) ||
    d.category.toLowerCase().includes(q) ||
    (d.indication && d.indication.toLowerCase().includes(q)) ||
    (d.search_terms && d.search_terms.some(t => t.toLowerCase().includes(q))) ||
    (d.aliases && d.aliases.some(a => a.toLowerCase().includes(q)))
  );
}, [uniqueDrugsList, drugSearch]);

// CALCULATOR DRUG LIST
const availableCalcDrugs = drugs.filter(
  d => d.species === calcPatient.species
);

const filteredProtocols = protocols.filter(
  p => p.name && p.name.toLowerCase().includes(protocolSearch.toLowerCase())
);

const filteredProtoDrugs = drugs.filter(
  d => d.name && d.name.toLowerCase().includes(protoDrugSearch.toLowerCase())
);

  // --- Helper Functions ---
  const handleToggleFav = (drugName) => {
    const isFav = favourites.includes(drugName);
    const newFavs = isFav ? favourites.filter(f => f !== drugName) : [...favourites, drugName];
    setFavourites(newFavs);
    localStorage.setItem("vetlearn-fav-drugs", JSON.stringify(newFavs));
    toast.success(isFav ? "Removed from Favourites" : "Added to Favourites");
  };

  const handleRemoveRecent = (drugName) => {
    const newRecent = recentlyViewed.filter(r => r !== drugName);
    setRecentlyViewed(newRecent);
    localStorage.setItem("vetlearn-recent-drugs", JSON.stringify(newRecent));
  };

  const copyDrugSummary = () => {
    navigator.clipboard.writeText(`VetLearn Monograph: ${activeMonographName}\nAvailable for: ${[...new Set(activeMonographDoses.map(d => d.species))].join(", ")}`);
    toast.success("Summary copied to clipboard");
  };

  // FIXED ISSUE #4: Updated Interaction Checker Logic
  const checkInteractions = async () => {
    if(!interactionDrugA || !interactionDrugB) {
      toast.error("Select two drugs to check");
      return;
    }
    setCheckingInteractions(true);
    
    const nameA = uniqueDrugsList.find(d => String(d.id) === interactionDrugA)?.name || interactionDrugA;
    const nameB = uniqueDrugsList.find(d => String(d.id) === interactionDrugB)?.name || interactionDrugB;
    
    try {
      const { data } = await supabase.from('drug_interactions')
        .select('*')
        .or(`and(drug_name.ilike.%${nameA}%,interacting_drug.ilike.%${nameB}%),and(drug_name.ilike.%${nameB}%,interacting_drug.ilike.%${nameA}%)`);
      setInteractionResults(data || []);
    } catch(e) {
      toast.error("Failed to check interactions");
    } finally {
      setCheckingInteractions(false);
    }
  };

  const renderText = (data, fallback = "No specific information recorded.") => {
    if (!data || (Array.isArray(data) && data.length === 0)) return <p className="opacity-50 text-sm italic">{fallback}</p>;
    if (Array.isArray(data)) {
      return (
        <ul className="list-disc pl-4 space-y-2">
          {data.map((item, index) => {
            let textStr = "";
            if (typeof item === 'string') textStr = item;
            else if (typeof item === 'object') {
              textStr = item.alias || item.name || item.content || item.text || item.description || item.contraindication || item.parameter || JSON.stringify(item);
            }
            return <li key={index} className={`text-sm leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{textStr}</li>;
          })}
        </ul>
      );
    }
    return <p className={`text-sm leading-relaxed whitespace-pre-wrap ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{String(data)}</p>;
  };

  const toggleSection = (section) => setExpandedSection(expandedSection === section ? null : section);

  // --- Calculator & Protocol DB Actions ---
  const handleSpeciesChange = (sp) => { setCalcPatient({ ...calcPatient, species: sp }); setSelectedCalcDrugs([]); };
  
  const handleAddDrugToCalc = (e) => {
    const drugId = String(e.target.value); 
    if (!drugId) return;
    const drug = drugs.find(d => String(d.id) === drugId); 
    if (!drug) return;
    addDrugToActiveCalc(drug); 
    e.target.value = ""; 
  };
  
  const handleAddProtocolToCalc = (e) => {
    const protocolId = String(e.target.value); 
    if (!protocolId) return;
    const protocol = protocols.find(p => String(p.id) === protocolId); 
    if (!protocol) return;
    
    const newDrugs = [];
    if (Array.isArray(protocol.drug_ids)) {
      protocol.drug_ids.forEach(id => { 
        const drug = drugs.find(d => String(d.id) === String(id) && d.species === calcPatient.species); 
        if (drug) newDrugs.push({ ...drug, selectedDose: parseSafeNumber(drug.dose_min, 0) }); 
      });
    }
    
    setSelectedCalcDrugs(prev => {
      const toAdd = newDrugs.filter(nd => !prev.some(pd => String(pd.id) === String(nd.id)));
      return [...prev, ...toAdd];
    });
    e.target.value = ""; 
    toast.success("Species-appropriate drugs loaded");
  };
  
  const addDrugToActiveCalc = (drug) => {
    if (selectedCalcDrugs.some(d => String(d.id) === String(drug.id))) return;
    setSelectedCalcDrugs(prev => [...prev, { ...drug, selectedDose: parseSafeNumber(drug.dose_min, 0) }]);
  };
  
  const updateCalcDrugDose = (id, newDoseStr) => { 
    setSelectedCalcDrugs(prev => prev.map(d => {
      if (String(d.id) !== String(id)) return d;
      if (newDoseStr === "") return { ...d, selectedDose: "" };
      return { ...d, selectedDose: newDoseStr }; 
    })); 
  };
  
  const removeCalcDrug = (id) => { setSelectedCalcDrugs(prev => prev.filter(d => String(d.id) !== String(id))); };

  const saveDrug = async () => {
    if (!drugForm.name) return toast.error("Drug name required");
    const payload = { user_id: user.id, name: drugForm.name.trim(), species: drugForm.species, concentration: drugForm.concentration ? parseFloat(drugForm.concentration) : null, dose_min: drugForm.dose_min ? parseFloat(drugForm.dose_min) : null, dose_max: drugForm.dose_max ? parseFloat(drugForm.dose_max) : null, route: drugForm.route.trim() || null, category: drugForm.category, active: true };
    const { error } = await supabase.from("drugs").insert(payload);
    if (error) { toast.error(error.message); } else { toast.success("Custom drug saved"); setDrugForm({ name: "", species: "Dog", concentration: "", dose_min: "", dose_max: "", route: "", category: "Analgesic" }); setShowAddDrug(false); loadDatabase(); }
  };

  const deleteDrug = async (id) => {
    const { error } = await supabase.from("drugs").delete().eq("id", id).eq("user_id", user.id);
    if (error) { toast.error("You do not have permission to delete this record."); } else { toast.success("Dose record deleted"); loadDatabase(); setActiveMonographDoses(prev => prev.filter(d => String(d.id) !== String(id))); if (activeMonographDoses.length <= 1) setMonographOpen(false); }
  };

  const saveProtocol = async () => {
    if (!protocolForm.name) return toast.error("Protocol name required");
    const { error } = await supabase.from("protocols").insert({ ...protocolForm, user_id: user.id });
    if (error) { toast.error(error.message); } else { toast.success("Protocol saved"); setProtocolForm({ name: "", drug_ids: [] }); loadDatabase(); }
  };

  const deleteProtocol = async (id) => {
    const { error } = await supabase.from("protocols").delete().eq("id", id).eq("user_id", user.id);
    if (error) { toast.error("You do not have permission to delete this record."); } else { toast.success("Protocol deleted"); loadDatabase(); }
  };

  const toggleProtocolDrug = (id) => {
    setProtocolForm(prev => { const exists = prev.drug_ids.includes(id); return { ...prev, drug_ids: exists ? prev.drug_ids.filter(d => String(d) !== String(id)) : [...prev.drug_ids, id] }; });
  };

  const openShareProtocolMenu = async (protocol) => {
    setSharingProtocol(protocol);
    setIsSharingLoading(true);
    try {
      const { data } = await supabase
        .from('connections')
        .select(`id, requester_id, receiver_id, requester:profiles!connections_requester_id_fkey(id, full_name, title), receiver:profiles!connections_receiver_id_fkey(id, full_name, title)`)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
        
      const friends = (data || []).map(conn => ({ connection_id: conn.id, colleague: conn.requester_id === user.id ? conn.receiver : conn.requester }));
      setFriendsList(friends);
    } catch (err) { toast.error("Could not load colleagues."); } finally { setIsSharingLoading(false); }
  };

  const confirmShareProtocol = async (friendId, protocol) => {
    setShareBusyId(friendId);
    try {
      const { error } = await supabase.from('shared_records').insert({ sender_id: user.id, receiver_id: friendId, record_type: 'protocol', record_id: String(protocol.id), record_title: protocol.name });
      if (error) throw error;
      toast.success(`Protocol shared successfully!`); setSharingProtocol(null);
    } catch (err) { toast.error("Failed to share protocol."); } finally { setShareBusyId(null); }
  };

  const speciesAvailable = [...new Set(activeMonographDoses.map(d => d.species || "Unknown"))];
  const tradeNamesList = activeSummary?.aliases?.filter(a => a.is_trade_name).map(a => a.alias) || activeSummary?.aliases?.map(a => a.alias) || [];

  return (
    <div className="pb-8">
      
      {/* Network Share Protocol Modal */}
      {sharingProtocol && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl flex flex-col relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]"}`}>
            <button onClick={() => setSharingProtocol(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-500/20 transition"><X size={20} /></button>
            <h2 className="text-2xl font-black mb-1">Share Protocol</h2>
            <p className="text-sm opacity-70 mb-6">Select a colleague to share "{sharingProtocol.name}" with.</p>

            {isSharingLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#71CFC2]" size={24}/></div>
            ) : friendsList.length === 0 ? (
              <div className="text-center py-8 opacity-60 bg-black/5 dark:bg-white/5 rounded-lg text-sm p-4">
                You have no active colleagues. Use the Network page to connect first!
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {friendsList.map(friend => (
                  <div key={friend.connection_id} className={`flex justify-between items-center p-3 rounded-xl border ${darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                    <div className="font-bold text-[15px]">{friend.colleague?.title} {friend.colleague?.full_name}</div>
                    <button onClick={() => confirmShareProtocol(friend.colleague.id, sharingProtocol)} disabled={shareBusyId === friend.colleague.id} className="bg-[#71CFC2] text-[#062F63] px-3 py-2 rounded-lg font-bold text-sm flex gap-2 items-center hover:opacity-90 transition">{shareBusyId === friend.colleague.id ? <Loader2 size={16} className="animate-spin"/> : "Send"}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- FORMULARY MONOGRAPH MODAL --- */}
      {monographOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
          <div className={`w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-3xl overflow-y-auto sm:rounded-2xl shadow-2xl flex flex-col relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-[#F9FCFB] text-[#113247]"}`}>
            
            {/* Monograph Header Card */}
            <div className={`sticky top-0 z-10 px-6 py-5 border-b backdrop-blur-md flex justify-between items-start ${darkMode ? "bg-[#0B242B]/90 border-white/10" : "bg-white/95 border-slate-200"}`}>
              <div className="w-full pr-4">
                <div className="flex justify-between items-start">
                  <h2 className="text-3xl font-black mb-2 text-[#113247] dark:text-white">{activeMonographName}</h2>
                  <button onClick={() => setMonographOpen(false)} className={`p-2 shrink-0 rounded-full transition ${darkMode ? "bg-white/10 hover:bg-white/20" : "bg-slate-50 hover:bg-slate-100 text-slate-500"}`}>
                    <X size={20} />
                  </button>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 mt-1 mb-3">
                  <span className="inline-block px-3 py-1 rounded bg-[#E8F8F5] dark:bg-[#71CFC2]/20 text-[#0F8F83] dark:text-[#71CFC2] text-xs font-black uppercase tracking-wider">
                    {activeMonographDoses[0]?.category || "Uncategorized"}
                  </span>
                  <span className="inline-block px-3 py-1 rounded bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider">
                    {speciesAvailable.join(", ")}
                  </span>
                  <span className="inline-block px-3 py-1 rounded bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider">
                    {activeMonographDoses.length} Records
                  </span>
                  {activeMonographDoses.some(d => d.user_id) && (
                    <span className="inline-block px-3 py-1 rounded bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                      <UserIcon size={10}/> Custom
                    </span>
                  )}
                </div>

                {/* Internal Monograph Navigation Tabs (UX Upgrade) */}
                <div className="flex overflow-x-auto gap-2 mt-4 pb-1 scrollbar-hide">
                  {[
                    { id: "overview", label: "Overview" },
                    { id: "safety", label: "Safety" },
                    { id: "monitoring", label: "Monitoring" },
                    { id: "pharmacology", label: "Pharmacology" }
                  ].map(tab => (
                    <button 
                      key={tab.id} 
                      onClick={() => setActiveMonographTab(tab.id)} 
                      className={`px-3 py-1.5 rounded-full whitespace-nowrap font-bold text-xs transition ${activeMonographTab === tab.id ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-slate-300 hover:bg-white/20" : "bg-[#E8F8F5] text-[#0B3760] hover:bg-[#d4f1ec]"}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-white/10">
                  <button onClick={() => handleToggleFav(activeMonographName)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${favourites.includes(activeMonographName) ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : darkMode ? "bg-white/5 hover:bg-white/10" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>
                    <Star size={14} className={favourites.includes(activeMonographName) ? "fill-current" : ""} /> Fav
                  </button>
                  <button onClick={copyDrugSummary} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${darkMode ? "bg-white/5 hover:bg-white/10" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>
                    <Copy size={14} /> Copy
                  </button>
                  <button 
                    onClick={() => { 
                      const defaultDose = activeMonographDoses[0];
                      if(defaultDose) {
                        setCalcPatient(prev => ({ ...prev, species: defaultDose.species || "Dog" }));
                        addDrugToActiveCalc(defaultDose);
                      }
                      setMonographOpen(false); 
                      setActiveTab("calculator"); 
                    }} 
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition bg-[#71CFC2] text-[#062F63] hover:opacity-90`}
                  >
                    <Syringe size={14} /> Calc Dose
                  </button>
                </div>
              </div>
            </div>
            
            {/* Monograph Body */}
            <div className="p-6 pt-2">
              
              {loadingSummary ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <HeartbeatLoader size={48} />
                  <p className="font-bold opacity-70 text-sm text-[#71CFC2]">Fetching clinical summary...</p>
                </div>
              ) : activeSummary ? (
                <>
                  {activeMonographTab === "overview" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2">
                      {activeSummary.clinicalPearls && activeSummary.clinicalPearls.length > 0 && (
                        <div className="mb-6">
                           <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-6 mb-3">Clinical Pearls</h3>
                           {activeSummary.clinicalPearls.map((pearl, idx) => (
                             <div key={idx} className="p-4 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-900 dark:bg-yellow-900/10 dark:border-yellow-800/30 dark:text-yellow-100 mb-3 flex items-start gap-3">
                               <Lightbulb size={20} className="text-yellow-500 shrink-0 mt-0.5" />
                               <div className="text-sm font-semibold leading-relaxed">{pearl.pearl || pearl.description || pearl.text}</div>
                             </div>
                           ))}
                        </div>
                      )}

                      <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-6 mb-3">Dosing & Prescribing</h3>
                      
                      <AccordionSection id="dosing" title="Doses & Routes" icon={Syringe} iconColor="text-teal-500" expandedSection={expandedSection} onToggle={toggleSection} darkMode={darkMode}>
                        {speciesAvailable.map(species => (
                           <NestedDose key={species} species={species} spDoses={activeMonographDoses.filter(d => d.species === species)} user={user} deleteDrug={deleteDrug} darkMode={darkMode} />
                        ))}
                      </AccordionSection>

                      <AccordionSection id="trade_names" title="Trade Names & Aliases" icon={Tag} iconColor="text-indigo-500" expandedSection={expandedSection} onToggle={toggleSection} darkMode={darkMode}>
                        <div className="p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent dark:border-white/10">
                          {renderText(activeSummary?.aliases, "No trade names or aliases listed.")}
                        </div>
                      </AccordionSection>
                    </div>
                  )}

                  {activeMonographTab === "safety" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2">
                      {MONOGRAPH_CONFIG.safety.map(itemConfig => {
                        const data = itemConfig.key.split('.').reduce((obj, k) => obj && obj[k], activeSummary);
                        return (
                          <AccordionSection key={itemConfig.key} id={itemConfig.key} title={itemConfig.title} icon={itemConfig.icon} iconColor={`text-${itemConfig.colorClass}-500`} expandedSection={expandedSection} onToggle={toggleSection} darkMode={darkMode}>
                            {Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' 
                              ? data.map((item, i) => <ClinicalCard key={i} item={item} config={itemConfig} darkMode={darkMode} />)
                              : <div className="p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent dark:border-white/10">{renderText(data)}</div>
                            }
                          </AccordionSection>
                        );
                      })}
                    </div>
                  )}

                  {activeMonographTab === "monitoring" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2">
                      {MONOGRAPH_CONFIG.monitoring.map(itemConfig => {
                        const data = itemConfig.key.split('.').reduce((obj, k) => obj && obj[k], activeSummary);
                        return (
                          <AccordionSection key={itemConfig.key} id={itemConfig.key} title={itemConfig.title} icon={itemConfig.icon} iconColor={`text-${itemConfig.colorClass}-500`} expandedSection={expandedSection} onToggle={toggleSection} darkMode={darkMode}>
                            {Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' 
                              ? data.map((item, i) => <ClinicalCard key={i} item={item} config={itemConfig} darkMode={darkMode} />)
                              : <div className="p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent dark:border-white/10">{renderText(data)}</div>
                            }
                          </AccordionSection>
                        );
                      })}
                    </div>
                  )}

                  {activeMonographTab === "pharmacology" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2">
                      {MONOGRAPH_CONFIG.pharmacology.map(itemConfig => {
                        const data = itemConfig.key.split('.').reduce((obj, k) => obj && obj[k], activeSummary);
                        return (
                          <AccordionSection key={itemConfig.key} id={itemConfig.key} title={itemConfig.title} icon={itemConfig.icon} iconColor={`text-${itemConfig.colorClass}-500`} expandedSection={expandedSection} onToggle={toggleSection} darkMode={darkMode}>
                            {Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' 
                              ? data.map((item, i) => <ClinicalCard key={i} item={item} config={itemConfig} darkMode={darkMode} />)
                              : <div className="p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent dark:border-white/10">{renderText(data)}</div>
                            }
                          </AccordionSection>
                        );
                      })}
                    </div>
                  )}

                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* --- MAIN PAGE HEADER --- */}
      <div className={`relative overflow-hidden bg-gradient-to-br border rounded-lg p-6 mb-6 shadow-sm ${darkMode ? "from-[#12323A] to-[#0B242B] border-white/10 text-white" : "from-white to-[#DFF7F3] border-[#CDEBE7] text-[#113247]"}`}>
        <div className="relative">
          <h1 className="text-3xl font-black mb-2">Formulary</h1>
          <p className="text-sm opacity-80">Search drugs, calculate doses, and view clinical monographs.</p>
        </div>
      </div>

      <div className="flex overflow-x-auto gap-2 mb-6 pb-2 scrollbar-hide">
        {[{ id: "library", label: "Library" }, { id: "calculator", label: "Calculator" }, { id: "protocols", label: "Protocols" }, { id: "history", label: "History" }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition ${activeTab === tab.id ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <HeartbeatLoader size={80} />
          <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2]">Loading Formulary...</p>
        </div>
      ) : (
        <div className="animate-in fade-in">
          
          {/* LIBRARY TAB */}
          {activeTab === "library" && (
            <div className="space-y-6">
              
              {/* Interaction Checker Panel */}
              <div className={panelClass}>
                 <h2 className="font-black mb-3 flex items-center gap-2"><RefreshCw size={18}/> Interaction Checker</h2>
                 <div className="flex flex-col sm:flex-row gap-3 items-end">
                    <select className={`${fieldClass} flex-1`} value={interactionDrugA} onChange={(e) => setInteractionDrugA(e.target.value)}>
                       <option value="">Select Drug A...</option>
                       {uniqueDrugsList.map(d => <option key={`a-${d.id}`} value={d.id}>{d.name}</option>)}
                    </select>
                    <select className={`${fieldClass} flex-1`} value={interactionDrugB} onChange={(e) => setInteractionDrugB(e.target.value)}>
                       <option value="">Select Drug B...</option>
                       {uniqueDrugsList.map(d => <option key={`b-${d.id}`} value={d.id}>{d.name}</option>)}
                    </select>
                    <button onClick={checkInteractions} disabled={checkingInteractions} className="bg-[#71CFC2] text-[#062F63] px-4 py-3 rounded-lg font-bold w-full sm:w-auto flex justify-center items-center gap-2">
                      {checkingInteractions ? <Loader2 size={16} className="animate-spin" /> : "Check"}
                    </button>
                 </div>
                 
                 {interactionResults !== null && (
                   <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10">
                     {interactionResults.length === 0 ? (
                       <p className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">No known interactions found between these drugs in the database.</p>
                     ) : (
                       <div className="space-y-3">
                         {interactionResults.map((res, i) => (
                           <div key={i} className="p-4 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800/30">
                             <div className="font-black text-blue-800 dark:text-blue-300">{res.drug_a || res.drug_name} + {res.drug_b || res.interacting_drug}</div>
                             <div className="text-sm mt-1 text-blue-900 dark:text-blue-100">{res.mechanism || res.interaction}</div>
                             {res.recommendation && <div className="text-sm mt-2 font-semibold text-blue-900 dark:text-blue-100">Action: {res.recommendation}</div>}
                             {res.severity && <div className="text-[10px] uppercase tracking-widest mt-2 font-bold opacity-70 text-blue-800 dark:text-blue-200">Severity: {res.severity}</div>}
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                 )}
              </div>

              <div className={`flex items-center gap-2 px-4 rounded-xl border ${darkMode ? "bg-white/5 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
                <Search size={18} className={darkMode ? "text-slate-400" : "text-slate-500"}/>
                <input
                  placeholder="Search by drug, brand, or indication..."
                  className={`w-full py-4 outline-none bg-transparent text-sm font-bold ${darkMode ? "text-white placeholder:text-slate-400" : "text-[#113247]"}`}
                  value={drugSearch}
                  onChange={(e) => setDrugSearch(e.target.value)}
                />
                {drugSearch && <button onClick={() => setDrugSearch("")}><X size={16} className="opacity-50 hover:opacity-100"/></button>}
              </div>

              {!drugSearch && (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {favourites.length > 0 && (
                    <div className={panelClass}>
                      <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-3 flex items-center gap-2"><Star size={14}/> Favourites</h3>
                      <div className="flex flex-wrap gap-2">
                        {favourites.map(f => (
                          <div key={`fav-${f}`} className={`flex items-center overflow-hidden rounded-lg transition ${darkMode ? "bg-white/5" : "bg-slate-100"}`}>
                            <button onClick={() => openMonograph(f)} className="px-3 py-1.5 text-xs font-bold hover:opacity-80">{f}</button>
                            <button onClick={(e) => { e.stopPropagation(); handleToggleFav(f); }} className={`px-2 py-1.5 ${darkMode ? "text-slate-400 hover:text-red-400 hover:bg-red-500/20" : "text-slate-400 hover:text-red-500 hover:bg-red-50"}`}>
                              <X size={12}/>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {recentlyViewed.length > 0 && (
                    <div className={panelClass}>
                      <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-3 flex items-center gap-2"><Clock size={14}/> Recent</h3>
                      <div className="flex flex-wrap gap-2">
                        {recentlyViewed.map(r => (
                          <div key={`rec-${r}`} className={`flex items-center overflow-hidden rounded-lg transition ${darkMode ? "bg-white/5" : "bg-slate-100"}`}>
                            <button onClick={() => openMonograph(r)} className="px-3 py-1.5 text-xs font-bold hover:opacity-80">{r}</button>
                            <button onClick={(e) => { e.stopPropagation(); handleRemoveRecent(r); }} className={`px-2 py-1.5 ${darkMode ? "text-slate-400 hover:text-red-400 hover:bg-red-500/20" : "text-slate-400 hover:text-red-500 hover:bg-red-50"}`}>
                              <X size={12}/>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center px-1">
                 <h2 className="font-bold opacity-70">Drug Directory</h2>
                 <button onClick={() => setShowAddDrug(!showAddDrug)} className="bg-[#71CFC2] text-[#062F63] px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 shadow-sm">
                    <Plus size={14} /> Add Custom
                 </button>
              </div>

              {showAddDrug && (
                <div className={`${panelClass} border-l-4 border-l-[#71CFC2] animate-in slide-in-from-top-2`}>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="font-black">Add Custom Dosing Record</h2>
                    <button onClick={() => setShowAddDrug(false)}><X size={20} className="opacity-50"/></button>
                  </div>
                  <div className="grid grid-cols-[2fr_1fr] gap-3 mb-3">
                    <input className={fieldClass} placeholder="Drug Name (Must match exactly to link)" value={drugForm.name} onChange={(e) => setDrugForm({...drugForm, name: e.target.value})} />
                    <select className={fieldClass} value={drugForm.species} onChange={(e) => setDrugForm({...drugForm, species: e.target.value})}>
                      <option>Dog</option><option>Cat</option><option>Rabbit</option><option>Other</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <input className={fieldClass} type="number" step="0.01" placeholder="Dose Min (mg/kg)" value={drugForm.dose_min} onChange={(e) => setDrugForm({...drugForm, dose_min: e.target.value})} />
                    <input className={fieldClass} type="number" step="0.01" placeholder="Dose Max (mg/kg)" value={drugForm.dose_max} onChange={(e) => setDrugForm({...drugForm, dose_max: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-[1fr_2fr] gap-3 mb-3">
                    <input className={fieldClass} type="number" placeholder="mg/ml" value={drugForm.concentration} onChange={(e) => setDrugForm({...drugForm, concentration: e.target.value})} />
                    <input className={fieldClass} placeholder="Route (e.g. IV, IM, SC)" value={drugForm.route} onChange={(e) => setDrugForm({...drugForm, route: e.target.value})} />
                  </div>
                  <input className={fieldClass} placeholder="Category (e.g. Antibiotic, NSAID)" value={drugForm.category} onChange={(e) => setDrugForm({...drugForm, category: e.target.value})} />
                  
                  <button onClick={saveDrug} className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-3 font-bold mt-1">Save Dosing Record</button>
                </div>
              )}

              <div className="space-y-2">
                {filteredLibrary.map(d => {
                  const matchedAlias = drugSearch && d.aliases.find(a => a.toLowerCase().includes(drugSearch.toLowerCase()));
                  return (
                    <div 
                      key={d.id} 
                      className={`${panelClass} flex justify-between items-center cursor-pointer hover:border-[#71CFC2] transition-colors`}
                      onClick={() => openMonograph(d.name)}
                    >
                      <div>
                        <h3 className="font-black text-lg mb-1">
                          {d.name} 
                          {matchedAlias && <span className="ml-2 text-sm font-normal opacity-60">({matchedAlias})</span>}
                        </h3>
                        <div className="flex gap-2">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${darkMode ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"}`}>
                            {d.category}
                          </span>
                          {d.isCustom && (
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-[#71CFC2]/20 text-[#71CFC2]`}>
                              <UserIcon size={10}/> Custom
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={20} className="opacity-30" />
                    </div>
                  );
                })}
                {filteredLibrary.length === 0 && (
                  <div className="text-center py-10 opacity-50 text-sm">No drugs found matching "{drugSearch}".</div>
                )}
              </div>
            </div>
          )}

          {/* CALCULATOR TAB */}
          {activeTab === "calculator" && (
            <div className="space-y-4">
              <div className={panelClass}>
                <h2 className="font-black mb-4 flex items-center gap-2"><Syringe size={18}/> Patient Details</h2>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input className={fieldClass} placeholder="Patient Name (Opt)" value={calcPatient.name} onChange={(e) => setCalcPatient({...calcPatient, name: e.target.value})} />
                  <input className={fieldClass} type="number" placeholder="Weight (kg)" value={calcPatient.weight} onChange={(e) => setCalcPatient({...calcPatient, weight: e.target.value})} />
                </div>
                <div className="flex gap-2">
                  {["Dog", "Cat", "Rabbit"].map(sp => (
                    <button key={sp} onClick={() => handleSpeciesChange(sp)} className={`flex-1 py-2 rounded-lg font-bold transition ${calcPatient.species === sp ? "bg-[#71CFC2] text-[#071A24]" : darkMode ? "bg-white/10 text-slate-400" : "bg-slate-100 text-slate-500"}`}>{sp}</button>
                  ))}
                </div>
              </div>

              <div className={panelClass}>
                <h2 className="font-black mb-4 flex items-center gap-2"><Plus size={18}/> Add to Calculator</h2>
                
                <select className={`${fieldClass} mb-3`} onChange={handleAddProtocolToCalc} defaultValue="">
                  <option value="" disabled>+ Load Protocol...</option>
                  {protocols.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                
                <select className={fieldClass} onChange={handleAddDrugToCalc} defaultValue="">
                  <option value="" disabled>+ Add Single Drug...</option>
                  {availableCalcDrugs.map(d => <option key={d.id} value={d.id}>{d.name} ({d.route})</option>)}
                </select>
              </div>

              {selectedCalcDrugs.length > 0 && (
                <div className={`${panelClass} border-2 border-[#71CFC2]/30`}>
                  <h2 className="font-black mb-4">Calculated Doses</h2>
                  {selectedCalcDrugs.map((d, i) => {
                    
                    try {
                      // EXTREMELY SAFE PARSING TO PREVENT DOM CRASHES
                      const safeMin = parseSafeNumber(d.dose_min, 0);
                      let safeMax = parseSafeNumber(d.dose_max, 0);
                      if (safeMax <= safeMin) safeMax = safeMin > 0 ? safeMin * 2 : 10;
                      
                      const weight = parseSafeNumber(calcPatient.weight, 0);
                      
                      // Handle the user input dose safely
                      let doseNum = safeMin;
                      if (d.selectedDose !== "" && d.selectedDose !== undefined && d.selectedDose !== null) {
                         const parsed = parseFloat(d.selectedDose);
                         if (!isNaN(parsed)) doseNum = parsed;
                      }

                      const totalMg = (doseNum * weight).toFixed(2);
                      
                      const conc = parseSafeNumber(d.concentration, 0);
                      const totalMl = (conc > 0) ? (parseFloat(totalMg) / conc).toFixed(2) : null;

                      // Display logic
                      const parsedMg = parseFloat(totalMg);
                      const displayMg = (!isNaN(parsedMg) && parsedMg > 0) ? totalMg : "0.00";
                      const parsedMl = parseFloat(totalMl);
                      const displayMl = (!isNaN(parsedMl) && parsedMl > 0) ? totalMl : "0.00";

                      // Slider absolutely requires a valid number, fallback to min if invalid
                      const sliderValue = isNaN(parseFloat(doseNum)) ? safeMin : parseFloat(doseNum);

                      return (
                        <div key={`calc-${d.id}-${i}`} className="mb-4 pb-4 border-b border-slate-200 dark:border-white/10 last:border-0 last:mb-0 last:pb-0">
                          <div className="flex justify-between items-center mb-2">
                            <span 
                              className="font-bold cursor-pointer hover:text-[#71CFC2] transition-colors flex items-center gap-2" 
                              onClick={() => openMonograph(d.name || "")}
                              title="Open Monograph"
                            >
                              {d.name || "Unknown Drug"} <BookOpen size={14} className="opacity-50"/>
                            </span>
                            <button onClick={() => removeCalcDrug(d.id)} className="text-red-400 hover:text-red-500 p-1"><Trash2 size={16}/></button>
                          </div>
                          
                          <div className="flex justify-between items-center text-xs opacity-70 mb-2">
                            <span>Route: {d.route || "General"} | Range: {d.dose_min || 0} - {d.dose_max || 0} mg/kg</span>
                            {d.concentration && <span>Conc: {d.concentration} mg/ml</span>}
                          </div>
                          
                          <div className="flex items-center gap-3 mb-2">
                            <input 
                              type="range" 
                              min={safeMin} 
                              max={safeMax} 
                              step="0.01" 
                              value={sliderValue} 
                              onChange={(e) => updateCalcDrugDose(d.id, e.target.value)} 
                              className="flex-1 accent-[#71CFC2]" 
                            />
                            <input 
                              type="number" 
                              step="0.01" 
                              value={d.selectedDose !== undefined ? d.selectedDose : ""} 
                              onChange={(e) => updateCalcDrugDose(d.id, e.target.value)} 
                              className={`w-20 p-1 text-center rounded border ${darkMode ? "bg-white/5 border-white/20" : "bg-white border-slate-300"}`} 
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 mt-3">
                            <div className={`p-2 rounded font-bold text-center ${darkMode ? "bg-[#71CFC2]/20 text-[#71CFC2]" : "bg-[#0F8F83]/10 text-[#0F8F83]"}`}>{displayMg} mg</div>
                            {totalMl !== null && <div className={`p-2 rounded font-bold text-center ${darkMode ? "bg-[#71CFC2]/20 text-[#71CFC2]" : "bg-[#0F8F83]/10 text-[#0F8F83]"}`}>{displayMl} ml</div>}
                          </div>
                        </div>
                      );
                    } catch (err) {
                      return <div key={`calc-err-${i}`} className="p-4 text-red-500 text-sm font-bold border border-red-500 rounded-lg mb-4">Error loading this dose record. <button onClick={() => removeCalcDrug(d.id)} className="ml-2 underline">Remove</button></div>
                    }
                  })}
                  <button onClick={saveToHistory} className="w-full mt-4 bg-[#71CFC2] text-[#062F63] rounded-lg p-3 font-bold flex justify-center items-center gap-2"><Save size={18}/> Log to History</button>
                </div>
              )}
            </div>
          )}

          {/* PROTOCOLS TAB */}
          {activeTab === "protocols" && (
            <div className="space-y-4">
              <div className={panelClass}>
                <h2 className="font-black mb-4">Create Protocol</h2>
                <input className={fieldClass} placeholder="Protocol Name (e.g. Standard Premed)" value={protocolForm.name} onChange={(e) => setProtocolForm({...protocolForm, name: e.target.value})} />
                
                <div className="flex items-center gap-2 mt-4 mb-2 bg-transparent border-b pb-2 border-slate-200 dark:border-white/10">
                  <Search size={16} className={darkMode ? "text-slate-400" : "text-slate-500"}/>
                  <input
                    placeholder="Search individual dosing records to add..."
                    className={`w-full outline-none bg-transparent text-sm ${darkMode ? "text-white placeholder:text-slate-400" : "text-[#113247]"}`}
                    value={protoDrugSearch}
                    onChange={(e) => setProtoDrugSearch(e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap gap-2 mb-4 max-h-[200px] overflow-y-auto">
                  {filteredProtoDrugs.map(d => (
                    <button key={d.id} onClick={() => toggleProtocolDrug(d.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${protocolForm.drug_ids.includes(d.id) ? "bg-[#71CFC2] border-[#71CFC2] text-[#071A24]" : darkMode ? "border-white/20 text-slate-300 hover:bg-white/5" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                      {d.name} ({d.species} {d.route})
                    </button>
                  ))}
                  {filteredProtoDrugs.length === 0 && <span className="text-xs opacity-50">No matching drugs found...</span>}
                </div>
                <button onClick={saveProtocol} className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-3 font-bold">Save Protocol</button>
              </div>
              
              <div className="flex items-center gap-2 mb-4 bg-transparent border-b pb-2 border-slate-200 dark:border-white/10">
                <Search size={18} className={darkMode ? "text-slate-400" : "text-slate-500"}/>
                <input
                  placeholder="Search saved protocols..."
                  className={`w-full outline-none bg-transparent text-sm ${darkMode ? "text-white placeholder:text-slate-400" : "text-[#113247]"}`}
                  value={protocolSearch}
                  onChange={(e) => setProtocolSearch(e.target.value)}
                />
              </div>

              {filteredProtocols.map(p => (
                <div key={p.id} className={panelClass}>
                  <div className="flex justify-between items-center mb-2">
                    <div className="font-bold">{p.name}</div>
                    <div className="flex gap-2">
                      <button onClick={() => openShareProtocolMenu(p)} className={`p-2 rounded-md transition ${darkMode ? "text-slate-400 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-black"}`}><Share2 size={16}/></button>
                      {p.user_id === user.id && (<button onClick={() => deleteProtocol(p.id)} className={`p-2 rounded-md transition ${darkMode ? "text-slate-400 hover:bg-red-500/20 hover:text-red-400" : "text-slate-400 hover:bg-red-50 hover:text-red-500"}`}><Trash2 size={16}/></button>)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Array.isArray(p.drug_ids) && p.drug_ids.map(id => {
                      const d = drugs.find(dr => String(dr.id) === String(id));
                      return d ? <span key={`tag-${p.id}-${id}`} className={`text-[10px] px-2 py-1 rounded font-bold ${darkMode ? "bg-white/10" : "bg-slate-100"}`}>{d.name} ({d.species})</span> : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === "history" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="font-black flex items-center gap-2"><HistoryIcon size={18}/> Last 24 Hours</h2>
                <button onClick={() => exportDrugHistory(history)} className={`p-2 rounded-lg font-bold flex gap-2 items-center ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
                  <Printer size={16}/> Print PDF
                </button>
              </div>

              {history.length === 0 && <div className={`${panelClass} text-center opacity-70`}>No calculations logged in the last 24h.</div>}

              {history.map(record => (
                <div key={record.id} className={panelClass}>
                  <div className="flex justify-between items-start mb-3 border-b pb-2 dark:border-white/10">
                    <div>
                      <div className="font-black text-lg">{record.patientName || "Unnamed"}</div>
                      <div className="text-xs font-bold opacity-70 mt-1">{record.species} • {record.weight}kg</div>
                    </div>
                    <div className="text-xs opacity-50">{new Date(record.timestamp).toLocaleTimeString()}</div>
                  </div>
                  
                  {Array.isArray(record.calculatedDrugs) && record.calculatedDrugs.map((d, i) => (
                    <div key={`hist-${record.id}-${i}`} className="flex justify-between items-center text-sm py-1 border-b border-dashed last:border-0 dark:border-white/10">
                      <div>
                        <span className="font-bold">{d.name}</span> <span className="opacity-70 text-xs">({d.selectedDose}mg/kg)</span>
                      </div>
                      <div className="font-mono font-bold text-[#0F8F83] dark:text-[#71CFC2]">
                        {d.totalMl ? `${d.totalMl}ml` : `${d.totalMg}mg`}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}