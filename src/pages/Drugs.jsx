import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Syringe } from "lucide-react";
import toast from "react-hot-toast";
import PageBanner from "../components/PageBanner";
import { supabase } from "../supabaseClient";

export default function Drugs({ darkMode = false }) {
  const [drugs, setDrugs] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDrugs();
  }, []);

  const loadDrugs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("drugs")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      toast.error("Failed to load drug information");
      setDrugs([]);
    } else {
      setDrugs(data || []);
    }
    setLoading(false);
  };

  const filteredDrugs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return drugs;
    return drugs.filter(drug => [drug.name, drug.species, drug.route, drug.notes, drug.safety_guidance]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query))
    );
  }, [drugs, searchQuery]);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  return (
    <div className="pb-8">
      <PageBanner
        title="Global Drugs"
        subtitle="Search drug information, dosing and safety guidance."
        darkMode={darkMode}
        badges={[{ label: `${drugs.length} active drugs`, icon: <Syringe size={13} />, accent: true }]}
      />

      <div className={`${panelClass} !p-3 mb-6 flex items-center gap-3`}>
        <Search size={18} className={darkMode ? "text-slate-400" : "text-slate-500"} />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by drug, species, route or safety note..."
          className={`w-full bg-transparent outline-none text-sm font-bold ${darkMode ? "text-white placeholder:text-slate-400" : "text-[#113247]"}`}
        />
      </div>

      {loading ? (
        <div className={`${panelClass} flex justify-center py-12`}>
          <Loader2 className="animate-spin text-[#71CFC2]" size={28} />
        </div>
      ) : filteredDrugs.length === 0 ? (
        <div className={`${panelClass} text-center text-sm ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
          No drug records found.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDrugs.map(drug => (
            <div key={drug.id} className={panelClass}>
              <div className="flex justify-between gap-3">
                <div>
                  <h2 className={`font-black text-lg ${darkMode ? "text-white" : "text-[#113247]"}`}>{drug.name}</h2>
                  <div className={`text-sm mt-1 ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
                    {[drug.species, drug.route].filter(Boolean).join(" · ") || "General guidance"}
                  </div>
                </div>
              </div>

              {(drug.dose || drug.dosage) && (
                <div className="mt-4 text-sm">
                  <span className="font-black text-[#0F8F83]">Dose: </span>
                  {drug.dose || drug.dosage}
                </div>
              )}

              {(drug.safety_guidance || drug.notes) && (
                <p className={`mt-3 text-sm leading-6 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  {drug.safety_guidance || drug.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
