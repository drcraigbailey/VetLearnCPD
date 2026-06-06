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
import { canUseFeature, featureKeys } from "../utils/featureAccess";

// Helper components & utilities (assumed shared/existing)
const unique = (items) => [...new Set((items || []).filter(Boolean))];
const normalise = (value) => String(value || "").toLowerCase().trim();
const parseSafeNumber = (val, fallback = 0) => {
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  const match = String(val).match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : fallback;
};

// --- Main Component ---
export default function DrugCalculator({ user, darkMode = false, protocolMode = false, protocolContext = {} }) {
  const [patient, setPatient] = useState({ name: "", weight: "", species: "Dog" });
  const [selectedCalcDrugs, setSelectedCalcDrugs] = useState([]);
  
  // Interaction Checker State
  const [interactionDrugs, setInteractionDrugs] = useState([]);
  const [interactionSearch, setInteractionSearch] = useState("");
  const [interactionSearchResults, setInteractionSearchResults] = useState([]);
  const [interactionLoading, setInteractionLoading] = useState(false);
  const [interactionResults, setInteractionResults] = useState(null);

  // --- Interaction Checker Logic ---
  useEffect(() => {
    // Protocol support: prefill if provided
    if (protocolMode && protocolContext?.drugs?.length > 0 && interactionDrugs.length === 0) {
      setInteractionDrugs(protocolContext.drugs);
    }
  }, [protocolMode, protocolContext]);

  useEffect(() => {
    const checkInteractions = async () => {
      if (interactionDrugs.length < 2) {
        setInteractionResults(null);
        return;
      }
      setInteractionLoading(true);
      try {
        const pairs = [];
        for (let i = 0; i < interactionDrugs.length; i++) {
          for (let j = i + 1; j < interactionDrugs.length; j++) {
            pairs.push([interactionDrugs[i].name, interactionDrugs[j].name]);
          }
        }

        const orConditions = pairs.map(
          ([a, b]) => `and(drug_name.ilike.%${a}%,interacting_drug.ilike.%${b}%),and(drug_name.ilike.%${b}%,interacting_drug.ilike.%${a}%)`
        ).join(",");

        const { data, error } = await supabase
          .from("drug_interactions")
          .select("*")
          .or(orConditions);

        if (error) throw error;
        setInteractionResults(data || []);
      } catch (err) {
        console.error(err);
        toast.error("Could not check interactions");
      } finally {
        setInteractionLoading(false);
      }
    };
    checkInteractions();
  }, [interactionDrugs]);

  const addInteractionDrug = (drug) => {
    if (!interactionDrugs.find((d) => d.id === drug.id)) {
      setInteractionDrugs([...interactionDrugs, drug]);
    }
    setInteractionSearch("");
  };

  // --- UI ---
  const panelClass = "bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700";

  return (
    <div className="space-y-6">
      {/* 1. Calculator Section (Unified) */}
      <div className={panelClass}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Syringe /> Drug Calculator</h2>
        {/* ... (Existing patient details, search, and calc logic remain here) */}
      </div>

      {/* 2. Interaction Checker Section */}
      <div className={panelClass}>
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
          <AlertTriangle className="text-amber-500" /> Interaction Checker
        </h2>
        <p className="text-sm opacity-60 mb-4">Add two or more drugs to check for recorded interactions.</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {interactionDrugs.map((d) => (
            <span key={d.id} className="bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full text-sm flex items-center gap-2">
              {d.name} <button onClick={() => setInteractionDrugs(interactionDrugs.filter((i) => i.id !== d.id))}><X size={14} /></button>
            </span>
          ))}
        </div>

        <input
          className="w-full p-3 rounded-lg border dark:bg-slate-900 mb-4"
          placeholder="Search drug to add to checker..."
          value={interactionSearch}
          onChange={(e) => setInteractionSearch(e.target.value)}
        />
        
        {/* Interaction Results Display */}
        {interactionLoading && <p>Checking interactions...</p>}
        {interactionDrugs.length >= 2 && !interactionLoading && (
          <div className="mt-4">
            <h3 className="font-bold mb-2">Interaction Warnings</h3>
            {interactionResults?.length > 0 ? (
              <div className="space-y-3">
                {interactionResults.map((warn, i) => (
                  <div key={i} className="p-4 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded">
                    <p className="font-bold">{warn.drug_name} + {warn.interacting_drug}</p>
                    <p className="text-sm">{warn.interaction || warn.mechanism || warn.recommendation || warn.notes}</p>
                    {warn.severity && <p className="text-xs mt-2 uppercase font-bold text-amber-600">Severity: {warn.severity}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-green-600">No known interactions found in the database.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
