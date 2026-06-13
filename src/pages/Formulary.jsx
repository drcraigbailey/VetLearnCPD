import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Copy,
  FileText,
  History as HistoryIcon,
  Loader2,
  Pencil,
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
import AppPopup, { popupPresets } from "../components/AppPopup";
import HeartbeatLoader from "../components/HeartbeatLoader";
import { supabase } from "../supabaseClient";
import { exportDrugHistory } from "../utils/drugsPdfExport";
import { canUseFeature, featureKeys } from "../utils/featureAccess";

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
const emptyDrugForm = {
  id: null,
  name: "",
  species: "Dog",
  concentration: "",
  dose_min: "",
  dose_max: "",
  route: "",
  category: "Analgesic",
  indication: "",
  summary: "",
  warnings: "",
  contraindications: "",
  interactions: "",
  monitoring: ""
};

const additionalDrugFields = [
  { key: "indication", label: "Indications", placeholder: "What is this drug used for?" },
  { key: "summary", label: "Clinical summary", placeholder: "Add a clinical overview." },
  { key: "warnings", label: "Warnings", placeholder: "Add one warning per line." },
  { key: "contraindications", label: "Contraindications", placeholder: "Add one contraindication per line." },
  { key: "interactions", label: "Interactions", placeholder: "Add one interaction per line." },
  { key: "monitoring", label: "Monitoring", placeholder: "Add one monitoring recommendation per line." }
];

const clinicalItemsFromText = (text) => String(text || "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((description) => ({ description }));

const sectionClass = (darkMode) =>
  darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

const inputClass = (darkMode) =>
  `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${
    darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247] placeholder:text-slate-500"
  }`;

export default function Drugs({ user, darkMode = false, featureAccess, adminAccess = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const canUseMyDrugs = canUseFeature(featureAccess, featureKeys.myDrugs, adminAccess);
  const isMyDrugsPath = location.pathname === "/drugs/my-drugs" || location.pathname === "/drugs/my-monographs";
  const [activeTab, setActiveTab] = useState(isMyDrugsPath ? "my-drugs" : "library");
  const [drugs, setDrugs] = useState([]);
  const [allAliases, setAllAliases] = useState([]);
  const [drugCollaborations, setDrugCollaborations] = useState({});
  const [loading, setLoading] = useState(true);

  const [drugSearch, setDrugSearch] = useState("");
  const [myDrugSearch, setMyDrugSearch] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("");
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const [favourites, setFavourites] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);

  const [activeDrugName, setActiveDrugName] = useState("");
  const [activeDrugId, setActiveDrugId] = useState(null);
  const [activeDrugScope, setActiveDrugScope] = useState("library");
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
  const [drugForm, setDrugForm] = useState(emptyDrugForm);

  const [calcPatient, setCalcPatient] = useState({ name: "", weight: "", species: "Dog" });
  const [selectedCalcDrugs, setSelectedCalcDrugs] = useState([]);
  const [history, setHistory] = useState([]);

  const [checkingInteractions, setCheckingInteractions] = useState(false);
  const [interactionResults, setInteractionResults] = useState(null);
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [appPopup, setAppPopup] = useState(null);

  const closeAppPopup = () => setAppPopup(null);

  const panelClass = sectionClass(darkMode);
  const fieldClass = inputClass(darkMode);

  useEffect(() => {
    if (!user) return;
    loadDatabase();
    loadDrugCollections();
    loadLocalHistory();
  }, [user, canUseMyDrugs]);

  useEffect(() => {
    if (!canUseMyDrugs && activeDrugScope === "custom") {
      setMonographOpen(false);
      setShowAddDrug(false);
      setDrugForm(emptyDrugForm);
    }
  }, [activeDrugScope, canUseMyDrugs]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [drugSearch, selectedLetter]);

  // Track only the drug names to avoid re-triggering the check when a user merely adjusts a dose slider
  const selectedCalcDrugNames = useMemo(() => {
    return selectedCalcDrugs.map(d => d.name).sort().join(',');
  }, [selectedCalcDrugs]);

  // Automatic interaction check when selected calc drugs change
  useEffect(() => {
    if (selectedCalcDrugs.length < 2) {
      setInteractionResults(null);
      setCheckingInteractions(false);
      return;
    }

    const checkInteractions = async () => {
      setCheckingInteractions(true);
      const names = selectedCalcDrugNames.split(',');
      const orConditions = [];

      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const nameA = names[i];
          const nameB = names[j];
          orConditions.push(`and(drug_name.ilike.%${nameA}%,interacting_drug.ilike.%${nameB}%)`);
          orConditions.push(`and(drug_name.ilike.%${nameB}%,interacting_drug.ilike.%${nameA}%)`);
        }
      }

      const queryStr = orConditions.join(",");
      try {
        const { data } = await supabase.from("drug_interactions").select("*").or(queryStr);
        setInteractionResults(data || []);
        if (data && data.length > 0) {
          setShowInteractionModal(true); // Automatically pop up the modal if an interaction is found
        }
      } catch (error) {
        toast.error("Failed to check interactions");
        setInteractionResults([]);
      } finally {
        setCheckingInteractions(false);
      }
    };

    checkInteractions();
  }, [selectedCalcDrugNames]);

  const loadDatabase = async () => {
    setLoading(true);
    try {
      let drugsQuery = supabase.from("drugs").select("*").eq("active", true).order("name");
      if (!canUseMyDrugs) drugsQuery = drugsQuery.is("user_id", null);
      const [drugsRes, aliasesRes, collaborationsRes] = await Promise.all([
        drugsQuery,
        supabase.from("drug_aliases").select("*"),
        canUseMyDrugs
          ? supabase.from("drug_collaborators").select("drug_id, owner_id, user_id, permission").eq("user_id", user.id)
          : Promise.resolve({ data: [], error: null })
      ]);
      if (drugsRes.error) throw drugsRes.error;
      if (aliasesRes.error) throw aliasesRes.error;
      setDrugs(drugsRes.data || []);
      setAllAliases(aliasesRes.data || []);
      if (collaborationsRes.error) {
        console.warn("Drug collaboration access is not installed yet", collaborationsRes.error);
        setDrugCollaborations({});
      } else {
        setDrugCollaborations(Object.fromEntries((collaborationsRes.data || []).map((entry) => [String(entry.drug_id), entry])));
      }
    } catch (error) {
      console.error("Failed to load formulary", error);
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

  const buildDrugList = useCallback((sourceDrugs, isCustom) => {
    const map = new Map();

    sourceDrugs.forEach((drug) => {
      if (!drug.name) return;
      const key = normalise(drug.name);
      const details = drug.custom_details || {};
      const aliasRows = allAliases.filter((alias) => String(alias.drug_id) === String(drug.id) || normalise(alias.drug_name) === key);
      const aliases = aliasRows.map((alias) => alias.alias || alias.name).filter(Boolean);
      const brandNames = aliasRows.filter((alias) => alias.is_trade_name || alias.type === "brand").map((alias) => alias.alias || alias.name).filter(Boolean);
      const collaboration = drugCollaborations[String(drug.id)];
      const isOwned = drug.user_id === user.id;

      if (!map.has(key)) {
        map.set(key, {
          id: drug.id,
          user_id: drug.user_id,
          name: drug.name,
          category: drug.category || drug.drug_class || "Uncategorised",
          indication: drug.indication || drug.indications || details.indication || "",
          summary: drug.summary || drug.clinical_summary || drug.notes || details.summary || "",
          aliases,
          brandNames,
          searchTerms: unique([
            ...(Array.isArray(drug.search_terms) ? drug.search_terms : []),
            ...Object.values(details).filter((value) => typeof value === "string")
          ]),
          isCustom,
          isOwned,
          isShared: Boolean(isCustom && !isOwned),
          collaborationPermission: collaboration?.permission || null,
          canEdit: Boolean(isOwned || collaboration?.permission === "edit")
        });
      } else {
        const existing = map.get(key);
        existing.aliases = unique([...existing.aliases, ...aliases]);
        existing.brandNames = unique([...existing.brandNames, ...brandNames]);
        existing.searchTerms = unique([...existing.searchTerms, ...(Array.isArray(drug.search_terms) ? drug.search_terms : [])]);
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allAliases, drugCollaborations, user.id]);

  const libraryDrugsList = useMemo(
    () => buildDrugList(drugs.filter((drug) => !drug.user_id), false),
    [buildDrugList, drugs]
  );
  const myDrugsList = useMemo(
    () => canUseMyDrugs ? buildDrugList(drugs.filter((drug) => Boolean(drug.user_id)), true) : [],
    [buildDrugList, canUseMyDrugs, drugs, user.id]
  );
  const uniqueDrugsList = useMemo(
    () => [...libraryDrugsList, ...myDrugsList].sort((a, b) => a.name.localeCompare(b.name)),
    [libraryDrugsList, myDrugsList]
  );

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
  const filteredMyDrugs = useMemo(() => {
    const query = normalise(myDrugSearch);
    if (!query) return myDrugsList;
    return myDrugsList.filter((drug) => [
      drug.name,
      drug.category,
      drug.indication,
      drug.summary,
      ...drug.searchTerms
    ].map(normalise).some((value) => value.includes(query)));
  }, [myDrugSearch, myDrugsList]);
  const activeDrugRecord = (activeDrugScope === "custom" && activeDrugId
    ? myDrugsList.find((drug) => String(drug.id) === String(activeDrugId))
    : (activeDrugScope === "custom" ? myDrugsList : libraryDrugsList)
      .find((drug) => normalise(drug.name) === normalise(activeDrugName)));
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

  const openMonograph = useCallback(async (drugName, scope = "library", drugId = null) => {
    if (!drugName) return;
    if (scope === "custom" && !canUseMyDrugs) {
      toast.error("My Drugs is not available for your account");
      return;
    }
    const formattedName = normalise(drugName);
    const cacheKey = `${scope}:${formattedName}`;
    const doses = drugs.filter((drug) => (
      normalise(drug.name) === formattedName
      && (
        scope === "custom"
          ? Boolean(drug.user_id) && (!drugId || String(drug.id) === String(drugId))
          : !drug.user_id
      )
    ));
    if (doses.length === 0) return toast.error("This drug is not available");

    setActiveDrugName(drugName);
    setActiveDrugId(scope === "custom" ? drugId || doses[0]?.id || null : null);
    setActiveDrugScope(scope);
    setActiveDrugDoses(doses);
    const customDetails = doses[0]?.custom_details || {};
    setActiveSummary(scope === "custom" ? {
      aliases: [],
      warnings: clinicalItemsFromText(customDetails.warnings),
      contraindications: clinicalItemsFromText(customDetails.contraindications),
      interactions: clinicalItemsFromText(customDetails.interactions),
      monitoring: clinicalItemsFromText(customDetails.monitoring),
      speciesWarnings: [],
      drugInformation: clinicalItemsFromText(customDetails.summary || customDetails.indication),
      adverseEffects: [],
      clinicalPearls: []
    } : summaryCache[cacheKey] || null);
    setMonographOpen(true);
    setShareOpen(false);

    const savedNotes = JSON.parse(localStorage.getItem("vetlearn-drug-notes") || "{}");
    setNoteText(savedNotes[formattedName] || "");
    saveRecentlyViewedDrug(drugName);

    if (scope === "custom" || summaryCache[cacheKey] || doses.length === 0) return;

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
      setSummaryCache((prev) => ({ ...prev, [cacheKey]: summary }));
      setActiveSummary(summary);
    } catch {
      toast.error("Could not load drug details");
    } finally {
      setLoadingSummary(false);
    }
  }, [canUseMyDrugs, drugs, summaryCache, user.id]);

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
    if (activeDrugScope === "custom" && !canUseMyDrugs) {
      toast.error("My Drugs is not available for your account");
      return;
    }
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

  const shareDrugWithColleague = async (friendId, permission = "read") => {
    if (activeDrugScope === "custom" && !canUseMyDrugs) {
      toast.error("My Drugs is not available for your account");
      return;
    }
    const activeRecord = activeDrugDoses[0];
    const busyKey = `${friendId}:${permission}`;
    setShareBusyId(busyKey);

    let error;
    if (activeDrugScope === "custom") {
      if (!activeRecord || activeRecord.user_id !== user.id) {
        setShareBusyId(null);
        return toast.error("Only the owner can share this live monograph");
      }

      ({ error } = await supabase.from("drug_collaborators").upsert({
        drug_id: activeRecord.id,
        owner_id: user.id,
        user_id: friendId,
        permission
      }, { onConflict: "drug_id,user_id" }));
    } else {
      ({ error } = await supabase.from("shared_records").insert({
        sender_id: user.id,
        receiver_id: friendId,
        record_type: "drug",
        record_id: activeDrugName,
        record_title: activeDrugName
      }));
    }

    setShareBusyId(null);
    if (error) {
      console.error("Could not share drug", error);
      return toast.error(error.message || "Could not share drug");
    }

    const shareLabel = permission === "edit" ? "invited you to collaborate on" : "shared";
    const { error: notificationError } = await supabase.from("notifications").insert({
      user_id: friendId,
      type: "shared_drug",
      title: permission === "edit" ? "Drug collaboration invitation" : "Drug shared with you",
      message: `${user.email || "A colleague"} ${shareLabel} "${activeDrugName}".`,
      is_read: false,
      related_id: activeRecord?.id ? String(activeRecord.id) : null
    });
    if (notificationError) console.warn("Drug shared but notification could not be created", notificationError);

    toast.success(permission === "edit" ? "Collaboration access granted" : "Drug shared read-only");
    setShareOpen(false);
  };

  const quickShareDrug = async (drug) => {
    if (!drug?.isOwned) return toast.error("Only the owner can share this monograph");
    await openMonograph(drug.name, "custom", drug.id);
    await loadFriendsForSharing();
  };

  const saveDrug = async () => {
    if (!canUseMyDrugs) return toast.error("My Drugs is not available for your account");
    if (!drugForm.name.trim()) return toast.error("Drug name required");
    const payload = {
      name: drugForm.name.trim(),
      species: drugForm.species,
      concentration: drugForm.concentration ? parseFloat(drugForm.concentration) : null,
      dose_min: drugForm.dose_min ? parseFloat(drugForm.dose_min) : null,
      dose_max: drugForm.dose_max ? parseFloat(drugForm.dose_max) : null,
      route: drugForm.route.trim() || null,
      category: drugForm.category.trim() || "Custom",
      custom_details: {
        indication: drugForm.indication.trim(),
        summary: drugForm.summary.trim(),
        warnings: drugForm.warnings.trim(),
        contraindications: drugForm.contraindications.trim(),
        interactions: drugForm.interactions.trim(),
        monitoring: drugForm.monitoring.trim()
      },
      active: true
    };
    const query = drugForm.id
      ? supabase.from("drugs").update(payload).eq("id", drugForm.id)
      : supabase.from("drugs").insert({ ...payload, user_id: user.id });
    const { error } = await query;
    if (error) return toast.error(error.message);
    toast.success(drugForm.id ? "My Drug updated" : "My Drug saved");
    setDrugForm(emptyDrugForm);
    setShowAddDrug(false);
    loadDatabase();
  };

  const deleteDrug = async (id) => {
    if (!canUseMyDrugs) return toast.error("My Drugs is not available for your account");
    const { error } = await supabase.from("drugs").delete().eq("id", id).eq("user_id", user.id);
    if (error) return toast.error("You do not have permission to delete this record");
    toast.success("Dose record deleted");
    setActiveDrugDoses((prev) => prev.filter((dose) => String(dose.id) !== String(id)));
    loadDatabase();
  };

  const requestDeleteDrug = (id) => {
    if (activeDrugScope !== "custom" || !canUseMyDrugs) return;
    setAppPopup(popupPresets.deleteDrugDose({
      drugName: activeDrugName,
      onPrimary: () => {
        closeAppPopup();
        deleteDrug(id);
      },
      onSecondary: closeAppPopup
    }));
  };

  const startCreateDrug = () => {
    if (!canUseMyDrugs) return;
    setDrugForm(emptyDrugForm);
    setShowAddDrug(true);
  };

  const startEditDrug = (drugId) => {
    if (!canUseMyDrugs) return;
    const record = drugs.find((drug) => String(drug.id) === String(drugId) && Boolean(drug.user_id));
    if (!record) return toast.error("This drug is not available");
    const collaboration = drugCollaborations[String(record.id)];
    if (record.user_id !== user.id && collaboration?.permission !== "edit") {
      return toast.error("This monograph was shared read-only");
    }
    const details = record.custom_details || {};
    setDrugForm({
      id: record.id,
      name: record.name || "",
      species: record.species || "Dog",
      concentration: record.concentration ?? "",
      dose_min: record.dose_min ?? "",
      dose_max: record.dose_max ?? "",
      route: record.route || "",
      category: record.category || "Custom",
      indication: details.indication || "",
      summary: details.summary || "",
      warnings: details.warnings || "",
      contraindications: details.contraindications || "",
      interactions: details.interactions || "",
      monitoring: details.monitoring || ""
    });
    setShowAddDrug(true);
    setMonographOpen(false);
    setActiveTab("my-drugs");
    navigate("/drugs/my-drugs", { replace: true });
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
  const canUseCalculator = canUseFeature(featureAccess, featureKeys.drugCalculator, adminAccess);
  const canUseLibrary = canUseFeature(featureAccess, featureKeys.library, adminAccess);
  const formularyTabs = useMemo(() => [
    ...(canUseLibrary ? [{ id: "library", label: "Library" }] : []),
    ...(canUseMyDrugs ? [{ id: "my-drugs", label: "My Drugs" }] : []),
    ...(canUseCalculator ? [{ id: "calculator", label: "Calculator" }] : []),
    { id: "history", label: "History" }
  ], [canUseCalculator, canUseLibrary, canUseMyDrugs]);

  useEffect(() => {
    if (!formularyTabs.some((tab) => tab.id === activeTab)) setActiveTab(formularyTabs[0]?.id || "history");
  }, [activeTab, formularyTabs]);

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    if (tabId === "my-drugs") navigate("/drugs/my-drugs");
    else if (isMyDrugsPath) navigate("/drugs");
  };

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
        onDeleteDose={requestDeleteDrug}
        user={user}
        noteText={noteText}
        setNoteText={setNoteText}
        onSaveNote={saveDrugNote}
        onCopy={copyDrugSummary}
        onEdit={() => startEditDrug(activeDrugDoses[0]?.id)}
        canManageCustom={canUseMyDrugs && activeDrugScope === "custom" && Boolean(activeDrugRecord?.canEdit)}
        canShareCustom={activeDrugScope !== "custom" || Boolean(activeDrugRecord?.isOwned)}
        supportsCollaboration={activeDrugScope === "custom" && Boolean(activeDrugRecord?.isOwned)}
        onAddToCalculator={() => {
          if (activeDrugDoses[0]) {
            setCalcPatient((prev) => ({ ...prev, species: activeDrugDoses[0].species || "Dog" }));
            addDrugToActiveCalc(activeDrugDoses[0]);
            selectTab("calculator");
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
        {formularyTabs.map((tab) => (
          <button key={tab.id} onClick={() => selectTab(tab.id)} className={`px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition ${activeTab === tab.id ? "bg-[#71CFC2] text-[#062F63] shadow-md" : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
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
          {canUseLibrary && activeTab === "library" && (
            <LibraryTab
              darkMode={darkMode}
              panelClass={panelClass}
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
              openMonograph={(name, isCustom = false, drugId = null) => openMonograph(name, isCustom ? "custom" : "library", drugId)}
              handleToggleFav={handleToggleFav}
            />
          )}

          {canUseMyDrugs && activeTab === "my-drugs" && (
            <MyDrugsTab
              darkMode={darkMode}
              panelClass={panelClass}
              fieldClass={fieldClass}
              drugs={filteredMyDrugs}
              search={myDrugSearch}
              setSearch={setMyDrugSearch}
              showForm={showAddDrug}
              drugForm={drugForm}
              setDrugForm={setDrugForm}
              saveDrug={saveDrug}
              onCreate={startCreateDrug}
              onEdit={startEditDrug}
              onQuickShare={quickShareDrug}
              onOpen={(drug) => openMonograph(drug.name, "custom", drug.id)}
              onCloseForm={() => {
                setShowAddDrug(false);
                setDrugForm(emptyDrugForm);
              }}
            />
          )}

          {canUseCalculator && activeTab === "calculator" && (
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
              checkingInteractions={checkingInteractions}
              interactionResults={interactionResults}
              showInteractionModal={showInteractionModal}
              setShowInteractionModal={setShowInteractionModal}
            />
          )}

          {activeTab === "history" && <HistoryTab darkMode={darkMode} panelClass={panelClass} history={history} />}
        </div>
      )}

      <AppPopup
        open={!!appPopup}
        onClose={closeAppPopup}
        darkMode={darkMode}
        onSecondary={closeAppPopup}
        {...(appPopup || {})}
      />
    </div>
  );
}

function LibraryTab(props) {
  const {
    darkMode,
    panelClass,
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
    handleToggleFav
  } = props;

  const noActiveFilter = !drugSearch.trim() && !selectedLetter;

  return (
    <div className="space-y-6">
      {noActiveFilter && (
        <div className={`${panelClass} text-center`}>
          <BookOpen className="mx-auto mb-3 text-[#0F8F83]" size={30} />
          <h2 className="font-black text-xl mb-2">Find a drug quickly</h2>
          <p className="text-sm opacity-65 leading-6">Start typing below, or pick a letter. The full formulary stays hidden until you ask for a specific search or alphabet section.</p>
        </div>
      )}

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
        <div className="mb-4">
          <div>
            <h2 className="font-black text-lg">Browse A-Z</h2>
            <p className="text-sm opacity-60">Choose a letter to show matching drugs only.</p>
          </div>
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

      {noActiveFilter && (
        <div className="space-y-4">
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
            <DrugResultCard key={`${drug.isCustom ? "mine" : "formulary"}-${drug.id}`} drug={drug} darkMode={darkMode} panelClass={panelClass} search={drugSearch} onOpen={() => openMonograph(drug.name, drug.isCustom, drug.id)} />
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

function MyDrugsTab({
  darkMode,
  panelClass,
  fieldClass,
  drugs,
  search,
  setSearch,
  showForm,
  drugForm,
  setDrugForm,
  saveDrug,
  onCreate,
  onEdit,
  onQuickShare,
  onOpen,
  onCloseForm
}) {
  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-black text-xl">My Drugs</h2>
            <p className="text-sm opacity-65 mt-1">Create your own drug monographs and share them with colleagues.</p>
          </div>
          <button onClick={onCreate} className="bg-[#71CFC2] text-[#062F63] px-3 py-2 rounded-lg font-black text-xs flex items-center gap-1 shrink-0">
            <Plus size={14} /> Add Drug
          </button>
        </div>
      </section>

      {showForm && (
        <CustomDrugForm
          panelClass={panelClass}
          fieldClass={fieldClass}
          drugForm={drugForm}
          setDrugForm={setDrugForm}
          saveDrug={saveDrug}
          onClose={onCloseForm}
        />
      )}

      <div className={`flex items-center gap-2 px-4 rounded-xl border ${darkMode ? "bg-white/5 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
        <Search size={20} className="opacity-50" />
        <input
          className="w-full py-4 outline-none bg-transparent text-sm font-bold"
          placeholder="Search My Drugs..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {search && <button onClick={() => setSearch("")}><X size={16} /></button>}
      </div>

      {drugs.length === 0 ? (
        <div className={`${panelClass} text-center`}>
          <BookOpen className="mx-auto mb-3 text-[#0F8F83]" size={30} />
          <h3 className="font-black">{search ? "No matching drugs" : "No personal monographs yet"}</h3>
          <p className="text-sm opacity-60 mt-2">{search ? "Try another search." : "Use Add Drug to create your first monograph."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drugs.map((drug) => (
            <div key={drug.id} className={`${panelClass} flex items-center gap-3`}>
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(drug)}>
                <h3 className="font-black text-lg truncate">{drug.name}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-sm opacity-60">{drug.category || "My Drug"}</p>
                  {drug.isShared && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${drug.canEdit ? "bg-[#E8F8F5] text-[#0F8F83]" : "bg-slate-100 text-slate-500"}`}>
                      {drug.canEdit ? "Shared collaborator" : "Shared read-only"}
                    </span>
                  )}
                </div>
              </button>
              {drug.isOwned && (
                <button onClick={() => onQuickShare(drug)} className={`p-2.5 rounded-lg ${darkMode ? "bg-white/10" : "bg-[#E8F8F5]"} text-[#0F8F83]`} aria-label={`Share ${drug.name}`}>
                  <Share2 size={17} />
                </button>
              )}
              {drug.canEdit && (
                <button onClick={() => onEdit(drug.id)} className={`p-2.5 rounded-lg ${darkMode ? "bg-white/10" : "bg-[#E8F8F5]"} text-[#0F8F83]`} aria-label={`Edit ${drug.name}`}>
                  <Pencil size={17} />
                </button>
              )}
              <button onClick={() => onOpen(drug)} className="p-2.5 rounded-lg bg-[#71CFC2] text-[#062F63]" aria-label={`Open ${drug.name}`}>
                <ChevronRight size={17} />
              </button>
            </div>
          ))}
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
          {drug.isCustom && (
            <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full flex items-center gap-1 bg-[#71CFC2]/25 text-[#0F8F83] ring-1 ring-[#71CFC2]/50">
              <UserIcon size={10} /> {drug.isOwned ? "My Drug" : drug.canEdit ? "Shared collaborator" : "Shared drug"}
            </span>
          )}
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
  const [additionalField, setAdditionalField] = useState("");
  const selectedField = additionalDrugFields.find((field) => field.key === additionalField);

  return (
    <div className={`${panelClass} border-l-4 border-l-[#71CFC2] animate-in slide-in-from-top-2`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-black">{drugForm.id ? "Edit My Drug" : "Add My Drug"}</h2>
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

      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10">
        <label className="block text-xs font-black uppercase tracking-widest opacity-55 mb-2">Further information</label>
        <select className={fieldClass} value={additionalField} onChange={(event) => setAdditionalField(event.target.value)}>
          <option value="">Choose information to add...</option>
          {additionalDrugFields.map((field) => (
            <option key={field.key} value={field.key}>{field.label}{drugForm[field.key]?.trim() ? " (added)" : ""}</option>
          ))}
        </select>
        {selectedField && (
          <textarea
            className={`${fieldClass} min-h-[110px] mt-3`}
            placeholder={selectedField.placeholder}
            value={drugForm[selectedField.key]}
            onChange={(event) => setDrugForm({ ...drugForm, [selectedField.key]: event.target.value })}
          />
        )}
      </div>

      <button onClick={saveDrug} className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-3 font-bold mt-4">{drugForm.id ? "Save Changes" : "Save My Drug"}</button>
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
    onEdit,
    canManageCustom,
    canShareCustom,
    supportsCollaboration,
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
            {canShareCustom && <ActionButton onClick={onOpenShare} icon={<Share2 size={14} />}>Share</ActionButton>}
            {canManageCustom && <ActionButton onClick={onEdit} icon={<Pencil size={14} />}>Edit</ActionButton>}
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
                <InfoRow label="Indications" value={drug?.indication || "None recorded"} />
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
                            {canManageCustom && dose.user_id === user.id && <button onClick={() => onDeleteDose(dose.id)} className="text-red-400"><Trash2 size={15} /></button>}
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
                      <div key={friend.connection_id} className="flex flex-col gap-2 border-b border-slate-200/60 py-3 last:border-b-0 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm font-bold">{friend.colleague?.title} {friend.colleague?.full_name}</span>
                        <div className={`grid gap-2 ${supportsCollaboration ? "grid-cols-2" : "grid-cols-1"}`}>
                          <button onClick={() => onShare(friend.colleague.id, "read")} disabled={Boolean(shareBusyId)} className="rounded-lg bg-[#E8F8F5] text-[#0B3760] px-3 py-2 text-xs font-black disabled:opacity-50">
                            {shareBusyId === `${friend.colleague.id}:read` ? "Sharing..." : "Share read-only"}
                          </button>
                          {supportsCollaboration && (
                            <button onClick={() => onShare(friend.colleague.id, "edit")} disabled={Boolean(shareBusyId)} className="rounded-lg bg-[#71CFC2] text-[#062F63] px-3 py-2 text-xs font-black disabled:opacity-50">
                              {shareBusyId === `${friend.colleague.id}:edit` ? "Inviting..." : "Collaborate"}
                            </button>
                          )}
                        </div>
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

function CalculatorTab(props) {
  const {
    darkMode, panelClass, fieldClass,
    calcPatient, setCalcPatient,
    availableCalcDrugs, selectedCalcDrugs, setSelectedCalcDrugs,
    handleAddDrugToCalc, updateCalcDrugDose, saveToHistory, openMonograph,
    checkingInteractions, interactionResults,
    showInteractionModal, setShowInteractionModal
  } = props;

  const [calculatorSearch, setCalculatorSearch] = useState("");
  const filteredCalcDrugs = useMemo(() => {
    const q = normalise(calculatorSearch);
    if (!q) return [];
    return availableCalcDrugs
      .filter((drug) => [drug.name, drug.route, drug.category, drug.indication, drug.notes].some((value) => normalise(value).includes(q)))
      .slice(0, 12);
  }, [availableCalcDrugs, calculatorSearch]);

  const addSearchDrug = (drug) => {
    if (selectedCalcDrugs.some((item) => String(item.id) === String(drug.id))) return;
    setSelectedCalcDrugs((prev) => [...prev, { ...drug, selectedDose: parseSafeNumber(drug.dose_min, 0) }]);
    setCalculatorSearch("");
  };

  return (
    <div className="space-y-4">
      {/* Interaction Warning Modal */}
      <InteractionModal
        open={showInteractionModal}
        onClose={() => setShowInteractionModal(false)}
        interactions={interactionResults || []}
        darkMode={darkMode}
      />

      <div className={panelClass}>
        <h2 className="font-black mb-4 flex items-center gap-2"><Syringe size={18} /> Patient Details</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input className={fieldClass} placeholder="Patient name" value={calcPatient.name} onChange={(event) => setCalcPatient({ ...calcPatient, name: event.target.value })} />
          <input className={fieldClass} type="number" placeholder="Weight kg" value={calcPatient.weight} onChange={(event) => setCalcPatient({ ...calcPatient, weight: event.target.value })} />
        </div>
        <div className="flex gap-2 mb-5">
          {["Dog", "Cat", "Rabbit"].map((species) => <button key={species} onClick={() => { setCalcPatient({ ...calcPatient, species }); setSelectedCalcDrugs([]); }} className={`flex-1 py-2 rounded-lg font-bold ${calcPatient.species === species ? "bg-[#71CFC2] text-[#071A24]" : darkMode ? "bg-white/10 text-slate-400" : "bg-slate-100 text-slate-500"}`}>{species}</button>)}
        </div>

        <div className="border-t border-slate-200 dark:border-white/10 pt-5 mt-5">
          <h2 className="font-black mb-4 flex items-center gap-2"><Plus size={18} /> Add to Calculator</h2>
          <div className="relative mb-3">
            <Search size={17} className="absolute left-3 top-3.5 opacity-45" />
            <input
              className={`${fieldClass} pl-10`}
              placeholder="Search drugs by name..."
              value={calculatorSearch}
              onChange={(event) => setCalculatorSearch(event.target.value)}
            />
          </div>
          {calculatorSearch.trim().length > 0 && (
            <div className="space-y-2 mb-3">
              {filteredCalcDrugs.length === 0 ? (
                <p className="text-sm opacity-55">No matching drugs for {calcPatient.species}.</p>
              ) : filteredCalcDrugs.map((drug) => (
                <button
                  key={drug.id}
                  type="button"
                  onClick={() => addSearchDrug(drug)}
                  className={`w-full text-left rounded-lg p-3 border ${darkMode ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-[#DCEDEA] bg-[#F9FCFB] hover:bg-[#F0F6F5]"}`}
                >
                  <div className="font-black text-sm">{drug.name}</div>
                  <div className="text-xs opacity-60">
                    {[drug.route || "General route", drug.dose_min || drug.dose_max ? `${drug.dose_min || drug.dose_max}${drug.dose_max && drug.dose_max !== drug.dose_min ? ` - ${drug.dose_max}` : ""} mg/kg` : "", drug.concentration ? `${drug.concentration} mg/ml` : ""].filter(Boolean).join(" | ")}
                  </div>
                </button>
              ))}
            </div>
          )}
          <select className={fieldClass} onChange={handleAddDrugToCalc} defaultValue="">
            <option value="" disabled>Add single drug...</option>
            {availableCalcDrugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.name} ({drug.route || "General"})</option>)}
          </select>
        </div>
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
                  <button className="font-bold cursor-pointer hover:text-[#71CFC2] flex items-center gap-2" onClick={() => openMonograph(drug.name, drug.user_id ? "custom" : "library")}>{drug.name} <BookOpen size={14} /></button>
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

      {/* INTERACTION SECTION */}
      <div className={panelClass}>
        <h2 className="font-black mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-amber-500" /> Interaction Warnings</h2>
        {selectedCalcDrugs.length < 2 ? (
          <p className="text-sm opacity-55 italic">Add a second drug to check interactions.</p>
        ) : checkingInteractions ? (
          <div className="flex items-center gap-2 text-sm opacity-70"><Loader2 size={16} className="animate-spin" /> Checking interactions...</div>
        ) : interactionResults && interactionResults.length > 0 ? (
          <div className={`p-4 rounded-xl border ${darkMode ? "bg-amber-500/10 border-amber-500/20" : "bg-amber-50 border-amber-200"}`}>
            <p className="text-amber-700 dark:text-amber-400 font-bold mb-3 flex items-center gap-2">
              <AlertTriangle size={16} /> 
              {interactionResults.length} known interaction{interactionResults.length > 1 ? 's' : ''} found between selected drugs.
            </p>
            <button
              onClick={() => setShowInteractionModal(true)}
              className="w-full bg-amber-200/50 hover:bg-amber-200 text-amber-800 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 dark:text-amber-300 transition rounded-lg p-3 font-bold text-sm"
            >
              View Interaction Details
            </button>
          </div>
        ) : (
          <p className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">No known interactions found in the database.</p>
        )}
      </div>
    </div>
  );
}

function InteractionModal({ open, onClose, interactions, darkMode }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className={`w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-[#F9FCFB] text-[#113247]"}`}>
        <div className={`shrink-0 px-6 py-5 border-b flex justify-between items-center ${darkMode ? "border-white/10" : "border-slate-200"}`}>
          <h3 className="font-black text-xl flex items-center gap-2 text-amber-500">
            <AlertTriangle size={24} /> Interaction Warnings
          </h3>
          <button onClick={onClose} className={`p-2 rounded-full transition ${darkMode ? "bg-white/10 hover:bg-white/20" : "bg-slate-100 hover:bg-slate-200"}`}>
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          {interactions.map((result, index) => (
            <ClinicalItem key={index} item={result} darkMode={darkMode} />
          ))}
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
