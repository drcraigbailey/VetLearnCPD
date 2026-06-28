import { useEffect, useMemo, useState } from "react";
import { Loader2, WifiOff, X } from "lucide-react";
import toast from "react-hot-toast";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { cacheCalculatorData, getOfflineProtocols, protocolCacheType } from "../services/calculatorDataService";
import { supabase } from "../supabaseClient";
import { IconButton, SearchBox } from "./VetLearnUI";

const fieldClass = (darkMode) =>
  `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${
    darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247] placeholder:text-slate-500"
  }`;

const toIdList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const toDoseMap = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export default function ProtocolContextSelector({ user, darkMode = false, onProtocolChange }) {
  const isOnline = useOnlineStatus();
  const [protocols, setProtocols] = useState([]);
  const [protocolDrugs, setProtocolDrugs] = useState([]);
  const [cachedDrugs, setCachedDrugs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState(null);

  async function loadProtocols() {
    if (!user?.id) return;
    setLoading(true);
    const cached = await getOfflineProtocols(user.id);
    setProtocols(cached.protocols || []);
    setCachedDrugs(cached.drugs || []);
    setCacheUpdatedAt(cached.cached_at || null);

    if (!isOnline) {
      setLoading(false);
      return;
    }

    let result = await supabase
      .from("protocols")
      .select("*")
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order("name");

    if (result.error) {
      result = await supabase
        .from("protocols")
        .select("*")
        .eq("user_id", user.id)
        .order("name");
    }

    if (result.error) {
      if (!(cached.protocols || []).length) toast.error("Could not load protocols for the calculator");
      setLoading(false);
      return;
    }

    const remoteProtocols = result.data || [];
    const linkedIds = [...new Set(remoteProtocols.flatMap((protocol) => toIdList(protocol.drug_ids)).map(String))];
    const drugResult = linkedIds.length
      ? await supabase.from("drugs").select("id, name, species, route").in("id", linkedIds)
      : { data: [], error: null };
    const remoteDrugs = drugResult.error ? cached.drugs || [] : drugResult.data || [];
    const cachedAt = new Date().toISOString();
    setProtocols(remoteProtocols);
    setCachedDrugs(remoteDrugs);
    setCacheUpdatedAt(cachedAt);
    await cacheCalculatorData(protocolCacheType(user.id), {
      protocols: remoteProtocols,
      drugs: remoteDrugs,
      cached_at: cachedAt
    });
    setLoading(false);
  }

  useEffect(() => {
    loadProtocols();
  }, [user?.id, isOnline]);

  const selectedProtocol = useMemo(() => protocols.find((protocol) => String(protocol.id) === String(selectedId)), [protocols, selectedId]);
  const doseMap = toDoseMap(selectedProtocol?.drug_doses);

  useEffect(() => {
    const loadProtocolDrugs = async () => {
      const ids = toIdList(selectedProtocol?.drug_ids);
      if (!ids.length) {
        setProtocolDrugs([]);
        return;
      }

      const localRows = cachedDrugs.filter((drug) => ids.some((id) => String(id) === String(drug.id)));
      setProtocolDrugs(localRows);
      if (!isOnline) return;

      const { data, error } = await supabase
        .from("drugs")
        .select("id, name, species, route")
        .in("id", ids);

      if (!error) {
        const nextDrugs = [
          ...cachedDrugs.filter((drug) => !(data || []).some((item) => String(item.id) === String(drug.id))),
          ...(data || [])
        ];
        setProtocolDrugs(data || []);
        setCachedDrugs(nextDrugs);
        await cacheCalculatorData(protocolCacheType(user.id), {
          protocols,
          drugs: nextDrugs,
          cached_at: new Date().toISOString()
        });
      }
    };

    loadProtocolDrugs();
  }, [selectedProtocol?.id, isOnline]);

  useEffect(() => {
    if (!selectedProtocol) {
      onProtocolChange?.(null);
      return;
    }

    onProtocolChange?.({
      protocol: selectedProtocol,
      drugs: protocolDrugs,
      doseMap
    });
  }, [selectedProtocol, protocolDrugs, onProtocolChange]);

  const filteredProtocols = protocols.filter((protocol) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [protocol.name, protocol.indication].some((value) => String(value || "").toLowerCase().includes(query));
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <SearchBox
          darkMode={darkMode}
          placeholder="Search protocols..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select className={fieldClass(darkMode)} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Select protocol</option>
          {filteredProtocols.map((protocol) => (
            <option key={protocol.id} value={protocol.id}>{protocol.name}</option>
          ))}
        </select>

        {selectedId ? (
          <IconButton
            icon={X}
            label="Clear selected protocol"
            darkMode={darkMode}
            onClick={() => setSelectedId("")}
          />
        ) : null}
      </div>

      {loading && <div className="flex items-center gap-2 text-sm opacity-60"><Loader2 size={16} className="animate-spin" /> Loading protocols...</div>}
      {!isOnline && (
        <div className={`rounded-lg border p-3 text-sm ${darkMode ? "bg-[#71CFC2]/10 border-[#71CFC2]/20" : "bg-[#E8F8F5] border-[#BDE8E1]"}`}>
          <div className="flex items-center gap-2 font-black"><WifiOff size={15} /> Offline mode: using saved calculator data</div>
          {cacheUpdatedAt && <div className="mt-1 text-xs opacity-60">Last updated {new Date(cacheUpdatedAt).toLocaleString()}.</div>}
          {protocols.length === 0 && <div className="mt-2">This calculator needs saved data before it can be used offline. Open it while online first.</div>}
        </div>
      )}

      {selectedProtocol && (
        <div className={`rounded-lg border p-3 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
          <div className="font-black">{selectedProtocol.name}</div>
          {selectedProtocol.indication && <p className="text-sm opacity-65 leading-6 mt-1">{selectedProtocol.indication}</p>}
          {protocolDrugs.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {protocolDrugs.map((drug) => {
                const dose = doseMap[String(drug.id)];
                return (
                  <span key={drug.id} className="rounded-full bg-[#71CFC2]/20 text-[#0F8F83] px-3 py-1 text-xs font-black">
                    {drug.name}{dose?.dose ? ` - ${dose.dose} ${dose.dose_unit || "mg/kg"}` : drug.route ? ` - ${drug.route}` : ""}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm opacity-55 mt-2">This protocol has no linked drugs yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
