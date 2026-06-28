import { getOfflineDrugs } from "./offlineFormularyService";

const DB_NAME = "VetLearnCalculatorCache";
const DB_VERSION = 1;
const STORE_NAME = "calculator_data";
const LOCAL_HISTORY_LIMIT = 100;

export const calculatorDataTypes = {
  drugCalculators: "drug_calculators",
  criProtocols: "cri_protocols",
  emergencyDrugs: "emergency_drugs",
  fluidCalculators: "fluid_calculators",
  transfusionCalculators: "transfusion_calculators",
  toxicities: "toxicities",
  interactions: "interactions"
};

const openDatabase = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === "undefined") {
    reject(new Error("IndexedDB is not available on this device"));
    return;
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME, { keyPath: "type" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Unable to open calculator cache"));
});

const runRequest = async (mode, operation) => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    let request;

    try {
      request = operation(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }

    if (request) {
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error || new Error("Calculator cache request failed"));
    }

    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Calculator cache transaction failed"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("Calculator cache transaction was cancelled"));
    };
  });
};

const getRecord = (type) => runRequest("readonly", (store) => store.get(type));
const putRecord = (record) => runRequest("readwrite", (store) => store.put(record));
const normalise = (value) => String(value || "").trim().toLowerCase();
const asArray = (value) => Array.isArray(value) ? value : [];

const recordKey = (row) => String(
  row?.id
  || [
    normalise(row?.drug_name || row?.name || row?.toxin || row?.calculation_name),
    normalise(row?.species),
    normalise(row?.route),
    normalise(row?.indication),
    normalise(row?.interacting_drug)
  ].join("|")
);

const mergeUniqueRows = (existing, incoming) => {
  const records = new Map();
  [...asArray(existing), ...asArray(incoming)].forEach((row) => records.set(recordKey(row), row));
  return Array.from(records.values());
};

export const protocolCacheType = (userId) => `protocols:${String(userId || "anonymous")}`;
export const calculationHistoryCacheType = (userId) => `calculation_history:${String(userId || "anonymous")}`;

export const cacheCalculatorData = async (type, data, metadata = {}) => {
  const record = {
    type,
    data,
    cached_at: new Date().toISOString(),
    ...metadata
  };
  try {
    await putRecord(record);
    return record;
  } catch (error) {
    console.warn(`Could not cache calculator data for ${type}`, error);
    return null;
  }
};

export const mergeCalculatorData = async (type, data, metadata = {}) => {
  const existing = await getCachedCalculatorData(type);
  return cacheCalculatorData(type, mergeUniqueRows(existing, data), metadata);
};

export const getCachedCalculatorRecord = async (type) => {
  try {
    return await getRecord(type);
  } catch {
    return null;
  }
};

export const getCachedCalculatorData = async (type) => {
  const record = await getCachedCalculatorRecord(type);
  return record?.data ?? null;
};

export const getLastCalculatorCacheUpdate = async (type) => {
  const record = await getCachedCalculatorRecord(type);
  return record?.cached_at || null;
};

export const getOfflineDoseRows = async () => {
  let copies;
  try {
    copies = await getOfflineDrugs();
  } catch {
    return [];
  }
  return copies.flatMap((copy) => (copy.doses || []).map((dose) => ({
    ...dose,
    id: `offline-${dose.id}`,
    source_drug_id: dose.id,
    drug_name: dose.name || copy.drug_name,
    min_dose: dose.min_dose ?? dose.dose_min ?? "",
    max_dose: dose.max_dose ?? dose.dose_max ?? dose.min_dose ?? dose.dose_min ?? "",
    dose_unit: dose.dose_unit || "",
    concentration_unit: dose.concentration_unit || "",
    offline_source: true,
    saved_offline: copy.saved_offline === true,
    offline_updated_at: copy.local_updated_at || copy.local_saved_at || copy.remote_updated_at || null
  })));
};

export const getOfflineDrugOptions = async () => {
  let copies;
  try {
    copies = await getOfflineDrugs();
  } catch {
    return [];
  }
  return copies.map((copy) => ({
    ...(copy.drug || copy.doses?.[0] || {}),
    id: copy.drug_id,
    name: copy.drug_name,
    drug_aliases: copy.summary?.aliases || [],
    offline_summary: copy.summary || {},
    offline_source: true,
    saved_offline: copy.saved_offline === true
  }));
};

export const getOfflineInteractions = async () => {
  const [copiesResult, interactionsResult] = await Promise.allSettled([
    getOfflineDrugs(),
    getCachedCalculatorData(calculatorDataTypes.interactions)
  ]);
  const copies = copiesResult.status === "fulfilled" ? copiesResult.value : [];
  const cachedInteractions = interactionsResult.status === "fulfilled" ? interactionsResult.value : [];
  const formularyInteractions = copies.flatMap((copy) => copy.summary?.interactions || []);
  return mergeUniqueRows(cachedInteractions, formularyInteractions);
};

export const getOfflineEmergencyDrugs = async () => (
  await getCachedCalculatorData(calculatorDataTypes.emergencyDrugs)
) || [];

export const getOfflineProtocols = async (userId) => (
  await getCachedCalculatorData(protocolCacheType(userId))
) || { protocols: [], drugs: [] };

export const cacheLocalCalculation = async (userId, calculation) => {
  const type = calculationHistoryCacheType(userId);
  const existing = asArray(await getCachedCalculatorData(type));
  const row = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    local_only: true,
    ...calculation
  };
  const saved = await cacheCalculatorData(type, [row, ...existing].slice(0, LOCAL_HISTORY_LIMIT));
  return saved ? row : null;
};

export const getLocalCalculationHistory = async (userId) => (
  asArray(await getCachedCalculatorData(calculationHistoryCacheType(userId)))
);

export const getCalculatorAvailability = async (userId) => {
  const entries = await Promise.all(Object.values(calculatorDataTypes).map(async (type) => [
    type,
    Boolean((await getCachedCalculatorData(type))?.length)
  ]));
  const protocols = await getOfflineProtocols(userId);

  return {
    formulaOnly: {
      energy: true,
      unitConversion: true,
      dextrose: true,
      potassium: true,
      sodium: true,
      osmolality: true,
      prednisoloneTaper: true,
      pillCountManual: true
    },
    cached: {
      ...Object.fromEntries(entries),
      protocols: protocols.protocols.length > 0
    }
  };
};
