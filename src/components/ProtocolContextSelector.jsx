import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
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
  const [protocols, setProtocols] = useState([]);
  const [protocolDrugs, setProtocolDrugs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProtocols();
  }, [user?.id]);

  const loadProtocols = async () => {
    if (!user?.id) return;
    setLoading(true);

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

    if (result.error) toast.error("Could not load protocols for the calculator");
    setProtocols(result.data || []);
    setLoading(false);
  };

  const selectedProtocol = useMemo(() => protocols.find((protocol) => String(protocol.id) === String(selectedId)), [protocols, selectedId]);
  const doseMap = toDoseMap(selectedProtocol?.drug_doses);

  useEffect(() => {
    const loadProtocolDrugs = async () => {
      const ids = toIdList(selectedProtocol?.drug_ids);
      if (!ids.length) {
        setProtocolDrugs([]);
        return;
      }

      const { data, error } = await supabase
        .from("drugs")
        .select("id, name, species, route")
        .in("id", ids);

      if (!error) setProtocolDrugs(data || []);
    };

    loadProtocolDrugs();
  }, [selectedProtocol?.id]);

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
