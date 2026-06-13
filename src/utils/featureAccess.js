import { supabase } from "../supabaseClient";

export const featureKeys = {
  clinicalTools: "clinical_tools",
  drugCalculator: "drug_calculator",
  additionalCalculators: "additional_calculators",
  clinicalProtocols: "clinical_protocols",
  drugDatabase: "drug_database",
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

export const loadFeatureAccess = async () => {
  const entries = await Promise.all(
    Object.values(featureKeys).map(async (featureKey) => {
      const { data, error } = await supabase.rpc("has_feature", { feature: featureKey });
      if (error) return [featureKey, false];
      return [featureKey, Boolean(data)];
    })
  );

  return Object.fromEntries(entries);
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
