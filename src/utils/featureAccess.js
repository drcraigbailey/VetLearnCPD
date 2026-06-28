import { supabase } from "../supabaseClient";

const FEATURE_ACCESS_CACHE_KEY = "vetlearn-feature-access";

export const featureKeys = {
  clinicalTools: "clinical_tools",
  drugCalculator: "drug_calculator",
  additionalCalculators: "additional_calculators",
  clinicalProtocols: "clinical_protocols",
  drugDatabase: "drug_database",
  exoticsFormulary: "exotics_formulary",
  myDrugs: "my_drugs",
  library: "library",
  caseLogs: "case_logs",
  network: "network",
  messaging: "messaging",
  cpdTracker: "cpd_tracker",
  vault: "vault",
  aiAssistant: "ai_assistant",
  pillCount: "pill_counter"
};

export const defaultFeatureAccess = Object.values(featureKeys).reduce((acc, key) => {
  acc[key] = false;
  return acc;
}, {});

export const getCachedFeatureAccess = () => {
  if (typeof localStorage === "undefined") return defaultFeatureAccess;
  try {
    const cached = JSON.parse(localStorage.getItem(FEATURE_ACCESS_CACHE_KEY) || "null");
    return cached && typeof cached === "object"
      ? { ...defaultFeatureAccess, ...cached }
      : defaultFeatureAccess;
  } catch {
    return defaultFeatureAccess;
  }
};

export const loadFeatureAccess = async () => {
  const cached = getCachedFeatureAccess();
  const entries = await Promise.all(
    Object.values(featureKeys).map(async (featureKey) => {
      try {
        const { data, error } = await supabase.rpc("has_feature", { feature: featureKey });
        if (error) return [featureKey, cached[featureKey]];
        return [featureKey, Boolean(data)];
      } catch {
        return [featureKey, cached[featureKey]];
      }
    })
  );

  const access = Object.fromEntries(entries);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(FEATURE_ACCESS_CACHE_KEY, JSON.stringify(access));
    } catch {
      // Storage may be unavailable in a restricted browser context.
    }
  }
  return access;
};

export const canUseFeature = (featureAccess, featureKey) => {
  if (!featureKey) return true;
  if (!featureAccess) return true;
  return featureAccess[featureKey] !== false;
};

export const featureForPath = (path) => {
  if (path === "/cpd") return featureKeys.cpdTracker;
  if (path === "/caselogs") return featureKeys.caseLogs;
  if (path === "/drugs/my-drugs" || path === "/drugs/my-monographs") return featureKeys.myDrugs;
  if (path === "/drugs") return featureKeys.drugDatabase;
  if (path === "/clinical-tools") return featureKeys.clinicalTools;
  if (path === "/network") return featureKeys.network;
  if (path === "/messages") return featureKeys.messaging;
  if (path === "/protocols") return featureKeys.clinicalProtocols;
  if (path === "/vault") return featureKeys.vault;
  return null;
};
