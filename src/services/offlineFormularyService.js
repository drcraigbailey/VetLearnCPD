const DB_NAME = "VetLearnOfflineFormulary";
const DB_VERSION = 1;
const DRUG_STORE = "drug_copies";
const RECENT_STORE = "recent_drugs";
const RECENT_LIMIT = 8;

const nowIso = () => new Date().toISOString();
const normalise = (value) => String(value || "").trim().toLowerCase();
const asId = (value) => value === null || value === undefined ? "" : String(value);

const openDatabase = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === "undefined") {
    reject(new Error("IndexedDB is not available on this device"));
    return;
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;

    if (!database.objectStoreNames.contains(DRUG_STORE)) {
      const drugStore = database.createObjectStore(DRUG_STORE, { keyPath: "drug_id" });
      drugStore.createIndex("drug_name", "drug_name", { unique: false });
      drugStore.createIndex("saved_offline", "saved_offline", { unique: false });
      drugStore.createIndex("local_updated_at", "local_updated_at", { unique: false });
    }

    if (!database.objectStoreNames.contains(RECENT_STORE)) {
      const recentStore = database.createObjectStore(RECENT_STORE, { keyPath: "drug_id" });
      recentStore.createIndex("viewed_at", "viewed_at", { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Unable to open the offline formulary"));
});

const runRequest = async (storeName, mode, operation) => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let request;
    let result;

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
      request.onerror = () => reject(request.error || new Error("Offline formulary request failed"));
    }

    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Offline formulary transaction failed"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("Offline formulary transaction was cancelled"));
    };
  });
};

const getAll = (storeName) => runRequest(storeName, "readonly", (store) => store.getAll());
const getByKey = (storeName, key) => runRequest(storeName, "readonly", (store) => store.get(key));
const putValue = (storeName, value) => runRequest(storeName, "readwrite", (store) => store.put(value));
const deleteValue = (storeName, key) => runRequest(storeName, "readwrite", (store) => store.delete(key));

const getLatestDate = (snapshot) => {
  const summaryRows = Object.values(snapshot?.summary || {}).flatMap((value) => Array.isArray(value) ? value : []);
  const candidates = [
    snapshot?.remote_updated_at,
    snapshot?.drug?.updated_at,
    snapshot?.drug?.modified_at,
    ...(snapshot?.doses || []).flatMap((row) => [row?.updated_at, row?.modified_at]),
    ...summaryRows.flatMap((row) => [row?.updated_at, row?.modified_at])
  ].filter(Boolean);

  return candidates.reduce((latest, value) => {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return latest;
    return !latest || timestamp > Date.parse(latest) ? new Date(timestamp).toISOString() : latest;
  }, null);
};

const normaliseSnapshot = (snapshot) => {
  const doses = Array.isArray(snapshot?.doses)
    ? snapshot.doses
    : Array.isArray(snapshot?.drug_rows)
      ? snapshot.drug_rows
      : [];
  const primaryDrug = snapshot?.drug || doses[0] || {};
  const drugId = asId(snapshot?.drug_id || primaryDrug?.id || doses[0]?.id);
  const drugName = snapshot?.drug_name || primaryDrug?.name || doses[0]?.name || "";

  if (!drugId || !drugName) {
    throw new Error("A drug ID and name are required for offline storage");
  }

  return {
    ...snapshot,
    drug_id: drugId,
    drug_name: drugName,
    source: snapshot?.source || "official",
    drug: primaryDrug,
    doses,
    dose_ids: [...new Set(doses.map((row) => asId(row?.id)).filter(Boolean))],
    summary: snapshot?.summary || {},
    remote_updated_at: getLatestDate(snapshot),
    formulary_version: snapshot?.formulary_version
      || primaryDrug?.formulary_version
      || primaryDrug?.version
      || null
  };
};

const mergeSnapshot = (existing, snapshot, { pin }) => {
  const normalisedSnapshot = normaliseSnapshot(snapshot);
  const timestamp = nowIso();
  const isPinned = pin === true || (pin === undefined && existing?.saved_offline === true);

  return {
    ...existing,
    ...normalisedSnapshot,
    source: normalisedSnapshot.source || existing?.source || "official",
    local_saved_at: isPinned ? existing?.local_saved_at || timestamp : existing?.local_saved_at || null,
    local_updated_at: timestamp,
    is_pinned_offline: isPinned,
    saved_offline: isPinned
  };
};

const findStoredDrug = async (drugId) => {
  const id = asId(drugId);
  if (!id) return null;

  const direct = await getByKey(DRUG_STORE, id);
  if (direct) return direct;

  const allDrugs = await getAll(DRUG_STORE);
  return (allDrugs || []).find((record) => (
    record.dose_ids?.includes(id)
    || asId(record.drug?.id) === id
  )) || null;
};

const trimRecentCache = async () => {
  const recentEntries = (await getAll(RECENT_STORE) || [])
    .sort((a, b) => Date.parse(b.viewed_at || 0) - Date.parse(a.viewed_at || 0));
  const expiredEntries = recentEntries.slice(RECENT_LIMIT);

  await Promise.all(expiredEntries.map(async (entry) => {
    await deleteValue(RECENT_STORE, entry.drug_id);
    const storedDrug = await getByKey(DRUG_STORE, entry.drug_id);
    if (storedDrug && !storedDrug.saved_offline) {
      await deleteValue(DRUG_STORE, entry.drug_id);
    }
  }));
};

export const createOfflineDrugSnapshot = ({ drug, doses, summary, source = "official" }) => normaliseSnapshot({
  drug_id: drug?.id || doses?.[0]?.id,
  drug_name: drug?.name || doses?.[0]?.name,
  source,
  drug,
  doses,
  summary
});

export const saveDrugOffline = async (drug) => {
  const snapshot = normaliseSnapshot(drug);
  const existing = await findStoredDrug(snapshot.drug_id);
  const saved = mergeSnapshot(existing, snapshot, { pin: true });
  await putValue(DRUG_STORE, saved);
  return saved;
};

export const getOfflineDrug = async (drugId) => findStoredDrug(drugId);

export const getOfflineDrugByName = async (drugName) => {
  const target = normalise(drugName);
  if (!target) return null;
  const allDrugs = await getAll(DRUG_STORE);
  return (allDrugs || []).find((record) => normalise(record.drug_name) === target) || null;
};

export const getOfflineDrugs = async () => {
  const allDrugs = await getAll(DRUG_STORE);
  return (allDrugs || []).sort((a, b) => {
    if (a.saved_offline !== b.saved_offline) return a.saved_offline ? -1 : 1;
    return Date.parse(b.local_updated_at || 0) - Date.parse(a.local_updated_at || 0);
  });
};

export const getSavedOfflineDrugs = async () => {
  const allDrugs = await getOfflineDrugs();
  return allDrugs.filter((drug) => drug.saved_offline === true);
};

export const removeOfflineDrug = async (drugId) => {
  const existing = await findStoredDrug(drugId);
  if (!existing) return false;

  await deleteValue(RECENT_STORE, existing.drug_id);
  await deleteValue(DRUG_STORE, existing.drug_id);
  return true;
};

export const cacheRecentlyViewedDrug = async (drug) => {
  const snapshot = normaliseSnapshot(drug);
  const existing = await findStoredDrug(snapshot.drug_id);
  const cached = mergeSnapshot(existing, snapshot, { pin: existing?.saved_offline === true });

  await putValue(DRUG_STORE, cached);
  await putValue(RECENT_STORE, {
    drug_id: cached.drug_id,
    drug_name: cached.drug_name,
    viewed_at: nowIso()
  });
  await trimRecentCache();
  return cached;
};

export const markDrugRecentlyViewed = async (drugId) => {
  const existing = await findStoredDrug(drugId);
  if (!existing) return null;

  await putValue(RECENT_STORE, {
    drug_id: existing.drug_id,
    drug_name: existing.drug_name,
    viewed_at: nowIso()
  });
  await trimRecentCache();
  return existing;
};

export const getRecentlyViewedDrugs = async () => {
  const recentEntries = (await getAll(RECENT_STORE) || [])
    .sort((a, b) => Date.parse(b.viewed_at || 0) - Date.parse(a.viewed_at || 0));
  const drugs = await Promise.all(recentEntries.map((entry) => getByKey(DRUG_STORE, entry.drug_id)));
  return drugs.filter(Boolean);
};

export const isDrugAvailableOffline = async (drugId) => Boolean(await findStoredDrug(drugId));
