import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Copy,
  FileText,
  History as HistoryIcon,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Share2,
  ShieldAlert,
  Star,
  Syringe,
  Trash2,
  User as UserIcon,
  X
} from "lucide-react";
import PageBanner from "../components/PageBanner";
import HeartbeatLoader from "../components/HeartbeatLoader";
import { supabase } from "../supabaseClient";
import { exportDrugHistory } from "../utils/drugsPdfExport";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const pageSize = 25;

const parseSafeNumber = (val, fallback = 0) => {
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  if (val === null || val === undefined || val === "") return fallback;
  const match = String(val).match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : fallback;
};

const normalise = (value) => String(value || "").toLowerCase().trim();

const unique = (items) => [...new Set((items || []).filter(Boolean))];

const sectionClass = (darkMode) =>
  darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

const inputClass = (darkMode) =>
  `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${
    darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247] placeholder:text-slate-500"
  }`;

export default function Drugs({ user, darkMode = false }) {
  const [activeTab, setActiveTab] = useState("library");
  const [drugs, setDrugs] = useState([]);
  const [allAliases, setAllAliases] = useState([]);
  const [loading, setLoading] = useState(true);

  const [drugSearch, setDrugSearch] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("");
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const [favourites, setFavourites] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);

  const [activeDrugName, setActiveDrugName] = useState("");
  const [activeDrugDoses, setActiveDrugDoses] = useState([]);
  const [activeSummary, setActiveSummary] = useState(null);
  const [summaryCache, setSummaryCache] = useState({});
  const [monographOpen, setMonographOpen] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [shareBusyId, setShareBusyId] = useState(null);

  const [showAddDrug, setShowAddDrug] = useState(false);
  const [drugForm, setDrugForm] = useState({ name: "", species: "Dog", concentration: "", dose_min: "", dose_max: "", route: "", category: "Analgesic" });

  const [calcPatient, setCalcPatient] = useState({ name: "", weight: "", species: "Dog" });
  const [selectedCalcDrugs, setSelectedCalcDrugs] = useState([]);
  const [history, setHistory] = useState([]);

  const [checkingInteractions, setCheckingInteractions] = useState(false);
  const [interactionDrugA, setInteractionDrugA] = useState("");
  const [interactionDrugB, setInteractionDrugB] = useState("");
  const [interactionResults, setInteractionResults] = useState(null);

  const panelClass = sectionClass(darkMode);
  const fieldClass = inputClass(darkMode);

  useEffect(() => {
    if (!user) return;
    loadDatabase();
    loadDrugCollections();
    loadLocalHistory();
  }, [user]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [drugSearch, selectedLetter]);

  const loadDatabase = async () => {
    setLoading(true);
    try {
      const [drugsRes, aliasesRes] = await Promise.all([
        supabase.from("drugs").select("*").or(`user_id.is.null,user_id.eq.${user.id}`).eq("active", true).order("name"),
        supabase.from("drug_aliases").select("*")
      ]);
      if (drugsRes.error) throw drugsRes.error;
      setDrugs(drugsRes.data || []);
      setAllAliases(aliasesRes.data || []);
    } catch (error) {
      toast.error("Failed to load formulary");
    } finally {
      setLoading(false);
    }
  };

  const loadDrugCollections = async () => {
    const localFavs = JSON.parse(localStorage.getItem("vetlearn-fav-drugs") || "[]");
    const localRecent = JSON.parse(localStorage.getItem("vetlearn-recent-drugs") || "[]");
    setFavourites(localFavs.map((title) => ({ id: title, title, url: `/drugs/${encodeURIComponent(title)}`, local: true })));
    setRecentlyViewed(localRecent.map((title) => ({ id: title, title, url: `/drugs/${encodeURIComponent(title)}`, local: true })));

    const [favRes, recentRes] = await Promise.all([
      supabase.from("dashboard_favourites").select("*").eq("user_id", user.id).eq("type", "drug").order("created_at", { ascending: false }).limit(12),
      supabase.from("recently_viewed").select("*").eq("user_id", user.id).eq("item_type", "drug").order("viewed_at", { ascending: false }).limit(8)
    ]);

    if (!favRes.error) setFavourites(favRes.data || []);
    if (!recentRes.error) setRecentlyViewed(recentRes.data || []);
  };

  const loadLocalHistory = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("euthapp-drug-history") || "[]");
      const validHistory = Array.isArray(saved) ? saved.filter((item) => item.timestamp > Date.now() - 24 * 60 * 60 * 1000) : [];
      setHistory(validHistory);
      localStorage.setItem("euthapp-drug-history", JSON.stringify(validHistory));
    } catch {
      setHistory([]);
    }
  };

  const uniqueDrugsList = useMemo(() => {
    const map = new Map();

    drugs.forEach((drug) => {
      if (!drug.name) return;
      const key = normalise(drug.name);
      const aliasRows = allAliases.filter((alias) => String(alias.drug_id) === String(drug.id) || normalise(alias.drug_name) === key);
      const aliases = aliasRows.map((alias) => alias.alias || alias.name).filter(Boolean);
      const brandNames = aliasRows.filter((alias) => alias.is_trade_name || alias.type === "brand").map((alias) => alias.alias || alias.name).filter(Boolean);

      if (!map.has(key)) {
        map.set(key, {
          id: drug.id,
          name: drug.name,
          category: drug.category || drug.drug_class || "Uncategorised",
          indication: drug.indication || drug.indications || "",
          summary: drug.summary || drug.clinical_summary || drug.notes || "",
          aliases,
          brandNames,
          searchTerms: Array.isArray(drug.search_terms) ? drug.search_terms : [],
          isCustom: drug.user_id === user.id
        });
      } else {
        const existing = map.get(key);
        existing.aliases = unique([...existing.aliases, ...aliases]);
        existing.brandNames = unique([...existing.brandNames, ...brandNames]);
        existing.searchTerms = unique([...existing.searchTerms, ...(Array.isArray(drug.search_terms) ? drug.search_terms : [])]);
        existing.isCustom = existing.isCustom || drug.user_id === user.id;
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [drugs, allAliases, user.id]);

  const filteredLibrary = useMemo(() => {
    const q = normalise(drugSearch);
    if (q) {
      return uniqueDrugsList.filter((drug) => {
        const haystack = [
          drug.name,
          drug.category,
          drug.indication,
          drug.summary,
          ...drug.aliases,
          ...drug.brandNames,
          ...drug.searchTerms
        ].map(normalise);
        return haystack.some((value) => value.includes(q));
      });
    }

    if (selectedLetter) {
      return uniqueDrugsList.filter((drug) => drug.name?.toUpperCase().startsWith(selectedLetter));
    }

    return [];
  }, [drugSearch, selectedLetter, uniqueDrugsList]);

  const visibleLibrary = filteredLibrary.slice(0, visibleCount);
  const activeDrugRecord = uniqueDrugsList.find((drug) => normalise(drug.name) === normalise(activeDrugName));
  const isActiveFavourite = favourites.some((item) => normalise(item.title) === normalise(activeDrugName));

  const saveRecentlyViewedDrug = async (drugName) => {
    const updatedRecent = [drugName, ...JSON.parse(localStorage.getItem("vetlearn-recent-drugs") || "[]").filter((name) => name !== drugName)].slice(0, 8);
    localStorage.setItem("vetlearn-recent-drugs", JSON.stringify(updatedRecent));
    setRecentlyViewed(updatedRecent.map((title) => ({ id: title, title, local: true })));

    const { error } = await supabase.from("recently_viewed").insert({
      user_id: user.id,
      item_type: "drug",
      item_id: drugName,
      title: drugName,
      url: "/drugs",
      metadata: { source: "formulary" }
    });
    if (!error) loadDrugCollections();
  };

  const openMonograph = useCallback(async (drugName) => {
    if (!drugName) return;
    const formattedName = normalise(drugName);
    const doses = drugs.filter((drug) => normalise(drug.name) === formattedName);

    setActiveDrugName(drugName);
    setActiveDrugDoses(doses);
    setActiveSummary(summaryCache[formattedName] || null);
    setMonographOpen(true);
    setShareOpen(false);

    const savedNotes = JSON.parse(localStorage.getItem("vetlearn-drug-notes") || "{}");
    setNoteText(savedNotes[formattedName] || "");
    saveRecentlyViewedDrug(drugName);

    if (summaryCache[formattedName] || doses.length === 0) return;

    setLoadingSummary(true);
    const drugNames = unique(doses.map((drug) => drug.name));
    const drugIds = doses.map((drug) => drug.id);

    try {
      const [aliases, warnings, contraindications, interactions, monitoring, speciesWarnings, drugInfo, adverseEffects, pearls] = await Promise.all([
        supabase.from("drug_aliases").select("*").in("drug_id", drugIds),
        supabase.from("drug_warnings").select("*").in("drug_name", drugNames),
        supabase.from("contraindications").select("*").in("drug_name", drugNames),
        supabase.from("drug_interactions").select("*").in("drug_name", drugNames),
        supabase.from("monitoring_recommendations").select("*").in("drug_name", drugNames),
        supabase.from("species_warnings").select("*").in("drug_name", drugNames),
        supabase.from("drug_information").select("*").in("drug_name", drugNames),
        supabase.from("adverse_effects").select("*").in("drug_name", drugNames),
        supabase.from("clinical_pearls").select("*").in("drug_name", drugNames)
      ]);

      const summary = {
        aliases: aliases.data || [],
        warnings: warnings.data || [],
        contraindications: contraindications.data || [],
        interactions: interactions.data || [],
        monitoring: monitoring.data || [],
        speciesWarnings: speciesWarnings.data || [],
        drugInformation: drugInfo.data || [],
        adverseEffects: adverseEffects.data || [],
        clinicalPearls: pearls.data || []
      };
      setSummaryCache((prev) => ({ ...prev, [formattedName]: summary }));
      setActiveSummary(summary);
    } catch {
      toast.error("Could not load drug details");
    } finally {
      setLoadingSummary(false);
    }
  }, [drugs, summaryCache, user.id]);

  const handleToggleFav = async (drugName) => {
    const existing = favourites.find((item) => normalise(item.title) === normalise(drugName));

    if (existing && !existing.local) {
      const { error } = await supabase.from("dashboard_favourites").delete().eq("id", existing.id).eq("user_id", user.id);
      if (error) return toast.error("Could not remove favourite");
      setFavourites((prev) => prev.filter((item) => item.id !== existing.id));
      toast.success("Removed from favourites");
      return;
    }

    if (existing) {
      const next = favourites.filter((item) => normalise(item.title) !== normalise(drugName));
      setFavourites(next);
      localStorage.setItem("vetlearn-fav-drugs", JSON.stringify(next.map((item) => item.title)));
      toast.success("Removed from favourites");
      return;
    }

    const { data, error } = await supabase.from("dashboard_favourites").insert({
      user_id: user.id,
      type: "drug",
      title: drugName,
      url: "/drugs",
      metadata: { drug_name: drugName }
    }).select().single();

    if (error) {
      const next = [{ id: drugName, title: drugName, local: true }, ...favourites];
      setFavourites(next);
      localStorage.setItem("vetlearn-fav-drugs", JSON.stringify(next.map((item) => item.title)));
      toast.success("Added to favourites");
      return;
    }

    setFavourites((prev) => [data, ...prev]);
    toast.success("Added to favourites");
  };

  const saveDrugNote = () => {
    const notes = JSON.parse(localStorage.getItem("vetlearn-drug-notes") || "{}");
    notes[normalise(activeDrugName)] = noteText;
    localStorage.setItem("vetlearn-drug-notes", JSON.stringify(notes));
    toast.success("Drug note saved");
  };

  const loadFriendsForSharing = async () => {
    setShareOpen(true);
    const { data, error } = await supabase
      .from("connections")
      .select("id, requester_id, receiver_id, requester:profiles!connections_requester_id_fkey(id, full_name, title), receiver:profiles!connections_receiver_id_fkey(id, full_name, title)")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (error) return toast.error("Could not load colleagues");
    setFriendsList((data || []).map((connection) => ({
      connection_id: connection.id,
      colleague: connection.requester_id === user.id ? connection.receiver : connection.requester
    })));
  };

  const shareDrugWithColleague = async (friendId) => {
    setShareBusyId(friendId);
    const { error } = await supabase.from("shared_records").insert({
      sender_id: user.id,
      receiver_id: friendId,
      record_type: "drug",
      record_id: activeDrugName,
      record_title: activeDrugName
    });
    setShareBusyId(null);
    if (error) return toast.error("Could not share drug");
    toast.success("Drug shared");
    setShareOpen(false);
  };

  const checkInteractions = async () => {
    if (!interactionDrugA || !interactionDrugB) return toast.error("Select two drugs to check");
    setCheckingInteractions(true);

    const nameA = uniqueDrugsList.find((drug) => String(drug.id) === String(interactionDrugA))?.name || interactionDrugA;
    const nameB = uniqueDrugsList.find((drug) => String(drug.id) === String(interactionDrugB))?.name || interactionDrugB;

    try {
      const { data } = await supabase
        .from("drug_interactions")
        .select("*")
        .or(`and(drug_name.ilike.%${nameA}%,interacting_drug.ilike.%${nameB}%),and(drug_name.ilike.%${nameB}%,interacting_drug.ilike.%${nameA}%)`);
      setInteractionResults(data || []);
    } catch {
      toast.error("Failed to check interactions");
    } finally {
      setCheckingInteractions(false);
    }
  };

  const saveDrug = async () => {
    if (!drugForm.name.trim()) return toast.error("Drug name required");
    const { error } = await supabase.from("drugs").insert({
      user_id: user.id,
      name: drugForm.name.trim(),
      species: drugForm.species,
      concentration: drugForm.concentration ? parseFloat(drugForm.concentration) : null,
      dose_min: drugForm.dose_min ? parseFloat(drugForm.dose_min) : null,
      dose_max: drugForm.dose_max ? parseFloat(drugForm.dose_max) : null,
      route: drugForm.route.trim() || null,
      category: drugForm.category.trim() || "Custom",
      active: true
    });
    if (error) return toast.error(error.message);
    toast.success("Custom dosing record saved");
    setDrugForm({ name: "", species: "Dog", concentration: "", dose_min: "", dose_max: "", route: "", category: "Analgesic" });
    setShowAddDrug(false);
    loadDatabase();
  };

  const deleteDrug = async (id) => {
    const { error } = await supabase.from("drugs").delete().eq("id", id).eq("user_id", user.id);
    if (error) return toast.error("You do not have permission to delete this record");
    toast.success("Dose record deleted");
    setActiveDrugDoses((prev) => prev.filter((dose) => String(dose.id) !== String(id)));
    loadDatabase();
  };

  const addDrugToActiveCalc = (drug) => {
    if (selectedCalcDrugs.some((item) => String(item.id) === String(drug.id))) return;
    setSelectedCalcDrugs((prev) => [...prev, { ...drug, selectedDose: parseSafeNumber(drug.dose_min, 0) }]);
  };

  const handleAddDrugToCalc = (event) => {
    const drug = drugs.find((item) => String(item.id) === String(event.target.value));
    if (drug) addDrugToActiveCalc(drug);
    event.target.value = "";
  };

  const updateCalcDrugDose = (id, value) => {
    setSelectedCalcDrugs((prev) => prev.map((drug) => String(drug.id) === String(id) ? { ...drug, selectedDose: value } : drug));
  };

  const saveToHistory = () => {
    const weight = parseSafeNumber(calcPatient.weight, 0);
    if (weight <= 0) return toast.error("Enter a valid patient weight");
    if (selectedCalcDrugs.length === 0) return toast.error("Add drugs to calculate");

    const calculatedDrugs = selectedCalcDrugs.map((drug) => {
      const dose = parseSafeNumber(drug.selectedDose, 0);
      const totalMg = (dose * weight).toFixed(2);
      const conc = parseSafeNumber(drug.concentration, 0);
      return { ...drug, totalMg, totalMl: conc > 0 ? (parseFloat(totalMg) / conc).toFixed(2) : null };
    });

    const nextHistory = [{ id: Date.now().toString(), timestamp: Date.now(), patientName: calcPatient.name, weight, species: calcPatient.species, calculatedDrugs }, ...history];
    setHistory(nextHistory);
    localStorage.setItem("euthapp-drug-history", JSON.stringify(nextHistory));
    setSelectedCalcDrugs([]);
    setCalcPatient({ name: "", weight: "", species: calcPatient.species });
    toast.success("Saved to 24h history");
  };

  const groupedDoses = useMemo(() => {
    return activeDrugDoses.reduce((groups, dose) => {
      const species = dose.species || "General";
      const route = dose.route || "General";
      groups[species] = groups[species] || {};
      groups[species][route] = groups[species][route] || [];
      groups[species][route].push(dose);
      return groups;
    }, {});
  }, [activeDrugDoses]);

  const availableCalcDrugs = drugs.filter((drug) => drug.species === calcPatient.species);

  const copyDrugSummary = () => {
    navigator.clipboard.writeText(`VetLearn Formulary: ${activeDrugName}\nClass: ${activeDrugRecord?.category || "Uncategorised"}`);
    toast.success("Drug summary copied");
  };

  return (
    <div className="pb-8">
      <DrugMonograph
        open={monographOpen}
        onClose={() => setMonographOpen(false)}
        darkMode={darkMode}
        drugName={activeDrugName}
        drug={activeDrugRecord}
        doses={activeDrugDoses}
        groupedDoses={groupedDoses}
        summary={activeSummary}
        loading={loadingSummary}
        favourites={favourites}
        isFavourite={isActiveFavourite}
        onToggleFavourite={() => handleToggleFav(activeDrugName)}
        onDeleteDose={deleteDrug}
        user={user}
        noteText={noteText}
        setNoteText={setNoteText}
        onSaveNote={saveDrugNote}
        onCopy={copyDrugSummary}
        onAddToCalculator={() => {
          if (activeDrugDoses[0]) {
            setCalcPatient((prev) => ({ ...prev, species: activeDrugDoses[0].species || "Dog" }));
            addDrugToActiveCalc(activeDrugDoses[0]);
            setActiveTab("calculator");
            setMonographOpen(false);
          }
        }}
        shareOpen={shareOpen}
        friendsList={friendsList}
        onOpenShare={loadFriendsForSharing}
        onShare={shareDrugWithColleague}
        shareBusyId={shareBusyId}
      />

      <PageBanner
        title="Formulary"
        subtitle="Search drugs, calculate doses, and open clinical monographs without scrolling through the whole database."
        darkMode={darkMode}
        badges={[{ label: `${uniqueDrugsList.length} active drugs`, icon: <Syringe size={14} />, accent: true }]}
      />

      <div className="flex overflow-x-auto gap-2 mb-6 pb-2 scrollbar-hide">
        {[
          { id: "library", label: "Library" },
          { id: "calculator", label: "Calculator" },
          { id: "history", label: "History" }
        ].map((tab) => (
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
          {activeTab === "library" && (
            <LibraryTab
              darkMode={darkMode}
              panelClass={panelClass}
              fieldClass={fieldClass}
              uniqueDrugsList={uniqueDrugsList}
              drugSearch={drugSearch}
              setDrugSearch={setDrugSearch}
              selectedLetter={selectedLetter}
              setSelectedLetter={setSelectedLetter}
              visibleLibrary={visibleLibrary}
              filteredLibrary={filteredLibrary}
              visibleCount={visibleCount}
              setVisibleCount={setVisibleCount}
              favourites={favourites}
              recentlyViewed={recentlyViewed}
              openMonograph={openMonograph}
              handleToggleFav={handleToggleFav}
              showAddDrug={showAddDrug}
              setShowAddDrug={setShowAddDrug}
              drugForm={drugForm}
              setDrugForm={setDrugForm}
              saveDrug={saveDrug}
              interactionDrugA={interactionDrugA}
              setInteractionDrugA={setInteractionDrugA}
              interactionDrugB={interactionDrugB}
              setInteractionDrugB={setInteractionDrugB}
              checkingInteractions={checkingInteractions}
              checkInteractions={checkInteractions}
              interactionResults={interactionResults}
            />
          )}

          {activeTab === "calculator" && (
            <CalculatorTab
              darkMode={darkMode}
              panelClass={panelClass}
              fieldClass={fieldClass}
              calcPatient={calcPatient}
              setCalcPatient={setCalcPatient}
              availableCalcDrugs={availableCalcDrugs}
              selectedCalcDrugs={selectedCalcDrugs}
              setSelectedCalcDrugs={setSelectedCalcDrugs}
              handleAddDrugToCalc={handleAddDrugToCalc}
              updateCalcDrugDose={updateCalcDrugDose}
              saveToHistory={saveToHistory}
              openMonograph={openMonograph}
            />
          )}

          {activeTab === "history" && <HistoryTab darkMode={darkMode} panelClass={panelClass} history={history} />}
        </div>
      )}
    </div>
  );
}

function LibraryTab(props) {
  const {
    darkMode,
    panelClass,
    fieldClass,
    uniqueDrugsList,
    drugSearch,
    setDrugSearch,
    selectedLetter,
    setSelectedLetter,
    visibleLibrary,
    filteredLibrary,
    visibleCount,
    setVisibleCount,
    favourites,
    recentlyViewed,
    openMonograph,
    handleToggleFav,
    showAddDrug,
    setShowAddDrug,
    drugForm,
    setDrugForm,
    saveDrug,
    interactionDrugA,
    setInteractionDrugA,
    interactionDrugB,
    setInteractionDrugB,
    checkingInteractions,
    checkInteractions,
    interactionResults
  } = props;

  const noActiveFilter = !drugSearch.trim() && !selectedLetter;

  return (
    <div className="space-y-6">
      <div className={panelClass}>
        <h2 className="font-black mb-3 flex items-center gap-2"><RefreshCw size={18} /> Interaction Checker</h2>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <select className={`${fieldClass} flex-1`} value={interactionDrugA} onChange={(event) => setInteractionDrugA(event.target.value)}>
            <option value="">Select Drug A...</option>
            {uniqueDrugsList.map((drug) => <option key={`a-${drug.id}`} value={drug.id}>{drug.name}</option>)}
          </select>
          <select className={`${fieldClass} flex-1`} value={interactionDrugB} onChange={(event) => setInteractionDrugB(event.target.value)}>
            <option value="">Select Drug B...</option>
            {uniqueDrugsList.map((drug) => <option key={`b-${drug.id}`} value={drug.id}>{drug.name}</option>)}
          </select>
          <button onClick={checkInteractions} disabled={checkingInteractions} className="bg-[#71CFC2] text-[#062F63] px-4 py-3 rounded-lg font-bold w-full sm:w-auto flex justify-center items-center gap-2">
            {checkingInteractions ? <Loader2 size={16} className="animate-spin" /> : "Check"}
          </button>
        </div>
        {interactionResults !== null && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 space-y-3">
            {interactionResults.length === 0 ? (
              <p className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">No known interactions found between these drugs in the database.</p>
            ) : interactionResults.map((result, index) => (
              <ClinicalItem key={index} item={result} darkMode={darkMode} />
            ))}
          </div>
        )}
      </div>

      <div className={`flex items-center gap-2 px-4 rounded-xl border ${darkMode ? "bg-white/5 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
        <Search size={20} className={darkMode ? "text-slate-400" : "text-slate-500"} />
        <input
          placeholder="Search by drug, alias, brand, indication or class..."
          className={`w-full py-4 outline-none bg-transparent text-sm font-bold ${darkMode ? "text-white placeholder:text-slate-400" : "text-[#113247] placeholder:text-slate-500"}`}
          value={drugSearch}
          onChange={(event) => setDrugSearch(event.target.value)}
        />
        {drugSearch && <button onClick={() => setDrugSearch("")}><X size={16} className="opacity-50 hover:opacity-100" /></button>}
      </div>

      <div className={panelClass}>
        <div className="flex items-center justify-between mb-4 gap-3">
          <div>
            <h2 className="font-black text-lg">Browse A-Z</h2>
            <p className="text-sm opacity-60">Choose a letter to show matching drugs only.</p>
          </div>
          <button onClick={() => setShowAddDrug(!showAddDrug)} className="bg-[#71CFC2] text-[#062F63] px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1 shadow-sm shrink-0">
            <Plus size={14} /> Custom
          </button>
        </div>
        <div className="grid grid-cols-7 gap-2 sm:grid-cols-13">
          {alphabet.map((letter) => {
            const count = uniqueDrugsList.filter((drug) => drug.name?.toUpperCase().startsWith(letter)).length;
            const active = selectedLetter === letter && !drugSearch;
            return (
              <button
                key={letter}
                disabled={count === 0}
                onClick={() => {
                  setDrugSearch("");
                  setSelectedLetter(active ? "" : letter);
                }}
                className={`h-10 rounded-lg text-sm font-black transition ${active ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-slate-200 disabled:opacity-25" : "bg-[#F0F6F5] text-[#0B3760] disabled:opacity-30"}`}
              >
                {letter}
              </button>
            );
          })}
        </div>
      </div>

      {showAddDrug && <CustomDrugForm panelClass={panelClass} fieldClass={fieldClass} drugForm={drugForm} setDrugForm={setDrugForm} saveDrug={saveDrug} onClose={() => setShowAddDrug(false)} />}

      {noActiveFilter && (
        <div className="space-y-4">
          <div className={`${panelClass} text-center`}>
            <BookOpen className="mx-auto mb-3 text-[#0F8F83]" size={30} />
            <h2 className="font-black text-xl mb-2">Find a drug quickly</h2>
            <p className="text-sm opacity-65 leading-6">Start typing above, or pick a letter. The full formulary stays hidden until you ask for a specific search or alphabet section.</p>
          </div>
          <DrugChips title="Favourite Drugs" icon={<Star size={15} />} items={favourites} empty="Favourite drugs will appear here." onOpen={openMonograph} onRemove={handleToggleFav} darkMode={darkMode} />
          <DrugChips title="Recently Viewed" icon={<HistoryIcon size={15} />} items={recentlyViewed} empty="Opened monographs will appear here." onOpen={openMonograph} darkMode={darkMode} />
        </div>
      )}

      {!noActiveFilter && (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <h2 className="font-black text-lg">{drugSearch ? "Search Results" : `${selectedLetter} Drugs`}</h2>
              <p className="text-sm opacity-60">{filteredLibrary.length} match{filteredLibrary.length === 1 ? "" : "es"}</p>
            </div>
            {(drugSearch || selectedLetter) && <button className="text-xs font-black opacity-60" onClick={() => { setDrugSearch(""); setSelectedLetter(""); }}>Clear</button>}
          </div>

          {visibleLibrary.map((drug) => (
            <DrugResultCard key={drug.id} drug={drug} darkMode={darkMode} panelClass={panelClass} search={drugSearch} onOpen={() => openMonograph(drug.name)} />
          ))}

          {filteredLibrary.length === 0 && <div className={`${panelClass} text-center opacity-60 text-sm`}>No drugs found.</div>}
          {visibleCount < filteredLibrary.length && (
            <button onClick={() => setVisibleCount((count) => count + pageSize)} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] py-3 font-black">
              Show more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DrugResultCard({ drug, darkMode, panelClass, search, onOpen }) {
  const matchedAlias = search && drug.aliases.find((alias) => normalise(alias).includes(normalise(search)));
  return (
    <button className={`${panelClass} w-full flex justify-between items-center text-left hover:border-[#71CFC2] transition-colors`} onClick={onOpen}>
      <div className="min-w-0">
        <h3 className="font-black text-lg mb-1 truncate">
          {drug.name}
          {matchedAlias && <span className="ml-2 text-sm font-normal opacity-60">({matchedAlias})</span>}
        </h3>
        <div className="flex gap-2 flex-wrap">
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${darkMode ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"}`}>{drug.category}</span>
          {drug.brandNames.slice(0, 2).map((brand) => <span key={brand} className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#E8F8F5] text-[#0F8F83]">{brand}</span>)}
          {drug.isCustom && <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-[#71CFC2]/20 text-[#0F8F83]"><UserIcon size={10} /> Custom</span>}
        </div>
      </div>
      <ChevronRight size={20} className="opacity-30 shrink-0" />
    </button>
  );
}

function DrugChips({ title, icon, items, empty, onOpen, onRemove, darkMode }) {
  return (
    <div className={sectionClass(darkMode)}>
      <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-3 flex items-center gap-2">{icon} {title}</h3>
      {items.length === 0 ? <p className="text-sm opacity-55">{empty}</p> : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <div key={`${title}-${item.id}`} className={`flex items-center overflow-hidden rounded-lg ${darkMode ? "bg-white/5" : "bg-slate-100"}`}>
              <button onClick={() => onOpen(item.title)} className="px-3 py-1.5 text-xs font-bold hover:opacity-80">{item.title}</button>
              {onRemove && <button onClick={() => onRemove(item.title)} className="px-2 py-1.5 opacity-45 hover:opacity-100"><X size={12} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomDrugForm({ panelClass, fieldClass, drugForm, setDrugForm, saveDrug, onClose }) {
  return (
    <div className={`${panelClass} border-l-4 border-l-[#71CFC2] animate-in slide-in-from-top-2`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-black">Add Custom Dosing Record</h2>
        <button onClick={onClose}><X size={20} className="opacity-50" /></button>
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-3 mb-3">
        <input className={fieldClass} placeholder="Drug name" value={drugForm.name} onChange={(event) => setDrugForm({ ...drugForm, name: event.target.value })} />
        <select className={fieldClass} value={drugForm.species} onChange={(event) => setDrugForm({ ...drugForm, species: event.target.value })}>
          <option>Dog</option><option>Cat</option><option>Rabbit</option><option>Other</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <input className={fieldClass} type="number" step="0.01" placeholder="Dose min" value={drugForm.dose_min} onChange={(event) => setDrugForm({ ...drugForm, dose_min: event.target.value })} />
        <input className={fieldClass} type="number" step="0.01" placeholder="Dose max" value={drugForm.dose_max} onChange={(event) => setDrugForm({ ...drugForm, dose_max: event.target.value })} />
      </div>
      <div className="grid grid-cols-[1fr_2fr] gap-3 mb-3">
        <input className={fieldClass} type="number" placeholder="mg/ml" value={drugForm.concentration} onChange={(event) => setDrugForm({ ...drugForm, concentration: event.target.value })} />
        <input className={fieldClass} placeholder="Route" value={drugForm.route} onChange={(event) => setDrugForm({ ...drugForm, route: event.target.value })} />
      </div>
      <input className={fieldClass} placeholder="Class/category" value={drugForm.category} onChange={(event) => setDrugForm({ ...drugForm, category: event.target.value })} />
      <button onClick={saveDrug} className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-3 font-bold mt-3">Save Dosing Record</button>
    </div>
  );
}

function DrugMonograph(props) {
  const {
    open,
    onClose,
    darkMode,
    drugName,
    drug,
    groupedDoses,
    summary,
    loading,
    isFavourite,
    onToggleFavourite,
    onDeleteDose,
    user,
    noteText,
    setNoteText,
    onSaveNote,
    onCopy,
    onAddToCalculator,
    shareOpen,
    friendsList,
    onOpenShare,
    onShare,
    shareBusyId
  } = props;

  if (!open) return null;

  const aliases = unique([...(drug?.aliases || []), ...(summary?.aliases || []).map((item) => item.alias || item.name)]);
  const brandNames = unique([...(drug?.brandNames || []), ...(summary?.aliases || []).filter((item) => item.is_trade_name || item.type === "brand").map((item) => item.alias || item.name)]);
  const summaryItems = [...(summary?.clinicalPearls || []), ...(summary?.drugInformation || [])];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
      <div className={`w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-3xl overflow-y-auto sm:rounded-2xl shadow-2xl relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-[#F9FCFB] text-[#113247]"}`}>
        <div className={`sticky top-0 z-10 px-6 py-5 border-b backdrop-blur-md ${darkMode ? "bg-[#0B242B]/95 border-white/10" : "bg-white/95 border-slate-200"}`}>
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <h2 className="text-3xl font-black leading-tight mb-2">{drugName}</h2>
              <div className="flex flex-wrap gap-2">
                <PillLabel>{drug?.category || "Uncategorised"}</PillLabel>
                {Object.keys(groupedDoses).length > 0 && <PillLabel>{Object.keys(groupedDoses).join(", ")}</PillLabel>}
              </div>
            </div>
            <button onClick={onClose} className={`p-2 rounded-full transition ${darkMode ? "bg-white/10" : "bg-slate-100"}`}><X size={20} /></button>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-white/10">
            <ActionButton onClick={onToggleFavourite} active={isFavourite} icon={<Star size={14} className={isFavourite ? "fill-current" : ""} />}>{isFavourite ? "Favourited" : "Favourite"}</ActionButton>
            <ActionButton onClick={onAddToCalculator} icon={<Syringe size={14} />}>Calc Dose</ActionButton>
            <ActionButton onClick={onCopy} icon={<Copy size={14} />}>Copy</ActionButton>
            <ActionButton onClick={onOpenShare} icon={<Share2 size={14} />}>Share</ActionButton>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <HeartbeatLoader size={48} />
              <p className="font-bold opacity-70 text-sm text-[#71CFC2]">Fetching clinical summary...</p>
            </div>
          ) : (
            <>
              <MonographSection title="Drug Information" icon={<BookOpen size={18} />} darkMode={darkMode}>
                <InfoRow label="Drug class" value={drug?.category || "Uncategorised"} />
                <InfoRow label="Aliases" value={aliases.length ? aliases.join(", ") : "None recorded"} />
                <InfoRow label="Brand names" value={brandNames.length ? brandNames.join(", ") : "None recorded"} />
                <ClinicalList items={summaryItems} fallback={drug?.summary || "No clinical summary recorded."} darkMode={darkMode} />
              </MonographSection>

              <MonographSection title="Dose Information" icon={<Syringe size={18} />} darkMode={darkMode}>
                {Object.keys(groupedDoses).length === 0 ? <p className="text-sm opacity-55">No dose records available.</p> : Object.entries(groupedDoses).map(([species, routes]) => (
                  <div key={species} className="mb-4 last:mb-0">
                    <h4 className="font-black text-sm uppercase tracking-widest opacity-55 mb-2">{species}</h4>
                    {Object.entries(routes).map(([route, doses]) => (
                      <div key={`${species}-${route}`} className={`rounded-lg p-3 mb-2 ${darkMode ? "bg-white/5" : "bg-[#F0F6F5]"}`}>
                        <div className="font-black text-[#0F8F83] mb-2">{route}</div>
                        {doses.map((dose) => (
                          <div key={dose.id} className="flex justify-between gap-3 py-2 border-t border-slate-200/50 dark:border-white/10 first:border-t-0">
                            <div className="text-sm">
                              <span className="font-black">{dose.dose_min}{dose.dose_max && dose.dose_max !== dose.dose_min ? ` - ${dose.dose_max}` : ""} mg/kg</span>
                              {dose.concentration && <span className="opacity-60"> | {dose.concentration} mg/ml</span>}
                              {dose.notes && <div className="opacity-65 mt-1">{dose.notes}</div>}
                            </div>
                            {dose.user_id === user.id && <button onClick={() => onDeleteDose(dose.id)} className="text-red-400"><Trash2 size={15} /></button>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </MonographSection>

              <MonographSection title="Warnings" icon={<ShieldAlert size={18} />} darkMode={darkMode}>
                <WarningGroup title="Drug warnings" items={summary?.warnings} darkMode={darkMode} />
                <WarningGroup title="Contraindications" items={summary?.contraindications} darkMode={darkMode} />
                <WarningGroup title="Interactions" items={summary?.interactions} darkMode={darkMode} />
                <WarningGroup title="Monitoring" items={summary?.monitoring} darkMode={darkMode} />
                <WarningGroup title="Species warnings" items={summary?.speciesWarnings} darkMode={darkMode} />
                <WarningGroup title="Adverse effects" items={summary?.adverseEffects} darkMode={darkMode} />
              </MonographSection>

              <MonographSection title="User Tools" icon={<FileText size={18} />} darkMode={darkMode}>
                <textarea className={`${inputClass(darkMode)} min-h-[110px] mb-3`} placeholder="Add personal notes for this drug..." value={noteText} onChange={(event) => setNoteText(event.target.value)} />
                <button onClick={onSaveNote} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] py-3 font-black mb-4">Save Personal Notes</button>

                {shareOpen && (
                  <div className={`rounded-lg p-3 mt-4 ${darkMode ? "bg-white/5" : "bg-[#F0F6F5]"}`}>
                    {friendsList.length === 0 ? <p className="text-sm opacity-55">No colleagues available to share with.</p> : friendsList.map((friend) => (
                      <div key={friend.connection_id} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-sm font-bold">{friend.colleague?.title} {friend.colleague?.full_name}</span>
                        <button onClick={() => onShare(friend.colleague.id)} className="rounded-lg bg-[#71CFC2] text-[#062F63] px-3 py-2 text-xs font-black">
                          {shareBusyId === friend.colleague.id ? "Sending..." : "Send"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </MonographSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MonographSection({ title, icon, darkMode, children }) {
  return (
    <section className={sectionClass(darkMode)}>
      <h3 className="font-black text-lg mb-4 flex items-center gap-2 text-[#0B3760] dark:text-white">{icon}{title}</h3>
      {children}
    </section>
  );
}

function PillLabel({ children }) {
  return <span className="inline-block px-3 py-1 rounded bg-[#E8F8F5] dark:bg-[#71CFC2]/20 text-[#0F8F83] dark:text-[#71CFC2] text-xs font-black uppercase tracking-wider">{children}</span>;
}

function ActionButton({ children, icon, onClick, active }) {
  return <button onClick={onClick} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${active ? "bg-yellow-100 text-yellow-700" : "bg-[#E8F8F5] text-[#0B3760]"}`}>{icon}{children}</button>;
}

function InfoRow({ label, value }) {
  return <p className="text-sm mb-2"><span className="font-black opacity-60">{label}: </span>{value}</p>;
}

function ClinicalList({ items, fallback, darkMode }) {
  if (!items || items.length === 0) return <p className={`text-sm leading-6 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{fallback}</p>;
  return <div className="space-y-2">{items.slice(0, 6).map((item, index) => <ClinicalItem key={index} item={item} darkMode={darkMode} />)}</div>;
}

function ClinicalItem({ item, darkMode }) {
  const title = item.title || item.section || item.warning || item.contraindication || item.parameter || item.drug_b || item.interacting_drug || item.name;
  const body = item.description || item.details || item.text || item.content || item.notes || item.interaction || item.mechanism || item.recommendation || item.pearl || item.summary;
  return (
    <div className={`rounded-lg p-3 border ${darkMode ? "border-white/10 bg-white/5" : "border-[#DCEDEA] bg-white"}`}>
      {title && <div className="text-xs font-black uppercase tracking-widest opacity-55 mb-1">{title}</div>}
      <div className="text-sm leading-6 opacity-80">{body || JSON.stringify(item)}</div>
      {item.severity && <div className="text-[10px] font-black uppercase tracking-widest mt-2 text-amber-600">Severity: {item.severity}</div>}
    </div>
  );
}

function WarningGroup({ title, items, darkMode }) {
  return (
    <div className="mb-4 last:mb-0">
      <h4 className="font-black text-sm mb-2 flex items-center gap-2"><AlertTriangle size={14} className="text-amber-500" />{title}</h4>
      {!items || items.length === 0 ? <p className="text-sm opacity-45">None recorded.</p> : <div className="space-y-2">{items.map((item, index) => <ClinicalItem key={index} item={item} darkMode={darkMode} />)}</div>}
    </div>
  );
}

function CalculatorTab({ darkMode, panelClass, fieldClass, calcPatient, setCalcPatient, availableCalcDrugs, selectedCalcDrugs, setSelectedCalcDrugs, handleAddDrugToCalc, updateCalcDrugDose, saveToHistory, openMonograph }) {
  return (
    <div className="space-y-4">
      <div className={panelClass}>
        <h2 className="font-black mb-4 flex items-center gap-2"><Syringe size={18} /> Patient Details</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input className={fieldClass} placeholder="Patient name" value={calcPatient.name} onChange={(event) => setCalcPatient({ ...calcPatient, name: event.target.value })} />
          <input className={fieldClass} type="number" placeholder="Weight kg" value={calcPatient.weight} onChange={(event) => setCalcPatient({ ...calcPatient, weight: event.target.value })} />
        </div>
        <div className="flex gap-2">
          {["Dog", "Cat", "Rabbit"].map((species) => <button key={species} onClick={() => { setCalcPatient({ ...calcPatient, species }); setSelectedCalcDrugs([]); }} className={`flex-1 py-2 rounded-lg font-bold ${calcPatient.species === species ? "bg-[#71CFC2] text-[#071A24]" : darkMode ? "bg-white/10 text-slate-400" : "bg-slate-100 text-slate-500"}`}>{species}</button>)}
        </div>
      </div>

      <div className={panelClass}>
        <h2 className="font-black mb-4 flex items-center gap-2"><Plus size={18} /> Add to Calculator</h2>
        <select className={fieldClass} onChange={handleAddDrugToCalc} defaultValue="">
          <option value="" disabled>Add single drug...</option>
          {availableCalcDrugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.name} ({drug.route || "General"})</option>)}
        </select>
      </div>

      {selectedCalcDrugs.length > 0 && (
        <div className={`${panelClass} border-2 border-[#71CFC2]/30`}>
          <h2 className="font-black mb-4">Calculated Doses</h2>
          {selectedCalcDrugs.map((drug) => {
            const safeMin = parseSafeNumber(drug.dose_min, 0);
            const safeMax = Math.max(parseSafeNumber(drug.dose_max, safeMin), safeMin || 10);
            const dose = parseSafeNumber(drug.selectedDose, safeMin);
            const weight = parseSafeNumber(calcPatient.weight, 0);
            const totalMg = (dose * weight).toFixed(2);
            const conc = parseSafeNumber(drug.concentration, 0);
            const totalMl = conc > 0 ? (parseFloat(totalMg) / conc).toFixed(2) : null;
            return (
              <div key={drug.id} className="mb-4 pb-4 border-b border-slate-200 dark:border-white/10 last:border-0 last:mb-0 last:pb-0">
                <div className="flex justify-between items-center mb-2">
                  <button className="font-bold cursor-pointer hover:text-[#71CFC2] flex items-center gap-2" onClick={() => openMonograph(drug.name)}>{drug.name} <BookOpen size={14} /></button>
                  <button onClick={() => setSelectedCalcDrugs((prev) => prev.filter((item) => String(item.id) !== String(drug.id)))} className="text-red-400"><Trash2 size={16} /></button>
                </div>
                <div className="text-xs opacity-70 mb-2">Route: {drug.route || "General"} | Range: {drug.dose_min || 0} - {drug.dose_max || 0} mg/kg</div>
                <div className="flex items-center gap-3 mb-2">
                  <input type="range" min={safeMin} max={safeMax} step="0.01" value={dose} onChange={(event) => updateCalcDrugDose(drug.id, event.target.value)} className="flex-1 accent-[#71CFC2]" />
                  <input type="number" step="0.01" value={drug.selectedDose ?? ""} onChange={(event) => updateCalcDrugDose(drug.id, event.target.value)} className={`w-20 p-1 text-center rounded border ${darkMode ? "bg-white/5 border-white/20" : "bg-white border-slate-300"}`} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="p-2 rounded font-bold text-center bg-[#0F8F83]/10 text-[#0F8F83]">{totalMg} mg</div>
                  {totalMl && <div className="p-2 rounded font-bold text-center bg-[#0F8F83]/10 text-[#0F8F83]">{totalMl} ml</div>}
                </div>
              </div>
            );
          })}
          <button onClick={saveToHistory} className="w-full mt-4 bg-[#71CFC2] text-[#062F63] rounded-lg p-3 font-bold flex justify-center items-center gap-2"><Save size={18} /> Log to History</button>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ darkMode, panelClass, history }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-black flex items-center gap-2"><HistoryIcon size={18} /> Last 24 Hours</h2>
        <button onClick={() => exportDrugHistory(history)} className={`p-2 rounded-lg font-bold flex gap-2 items-center ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}><Printer size={16} /> Print PDF</button>
      </div>
      {history.length === 0 && <div className={`${panelClass} text-center opacity-70`}>No calculations logged in the last 24h.</div>}
      {history.map((record) => (
        <div key={record.id} className={panelClass}>
          <div className="flex justify-between items-start mb-3 border-b pb-2 dark:border-white/10">
            <div>
              <div className="font-black text-lg">{record.patientName || "Unnamed"}</div>
              <div className="text-xs font-bold opacity-70 mt-1">{record.species} | {record.weight}kg</div>
            </div>
            <div className="text-xs opacity-50">{new Date(record.timestamp).toLocaleTimeString()}</div>
          </div>
          {(record.calculatedDrugs || []).map((drug, index) => (
            <div key={`${record.id}-${index}`} className="flex justify-between items-center text-sm py-1 border-b border-dashed last:border-0 dark:border-white/10">
              <div><span className="font-bold">{drug.name}</span> <span className="opacity-70 text-xs">({drug.selectedDose}mg/kg)</span></div>
              <div className="font-mono font-bold text-[#0F8F83]">{drug.totalMl ? `${drug.totalMl}ml` : `${drug.totalMg}mg`}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}