import { supabase } from "../supabaseClient";

export const featureKeys = {
  clinicalTools: "clinical_tools",
  clinicalProtocols: "clinical_protocols",
  drugDatabase: "drug_database",
  library: "library",
  caseLogs: "case_logs",
  messaging: "messaging",
  cpdTracker: "cpd_tracker",
  vault: "vault",
  aiAssistant: "ai_assistant"
};

export const defaultFeatureAccess = Object.values(featureKeys).reduce((acc, key) => {
  acc[key] = true;
  return acc;
}, {});

export const loadFeatureAccess = async () => {
  const entries = await Promise.all(
    Object.values(featureKeys).map(async (featureKey) => {
      const { data, error } = await supabase.rpc("has_feature", { feature: featureKey });
      if (error) return [featureKey, true];
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
  if (path === "/drugs") return featureKeys.drugDatabase;
  if (path === "/clinical-tools") return featureKeys.clinicalTools;
  if (path === "/messages") return featureKeys.messaging;
  if (path === "/protocols") return featureKeys.clinicalProtocols;
  if (path === "/vault") return featureKeys.vault;
  return null;
};
