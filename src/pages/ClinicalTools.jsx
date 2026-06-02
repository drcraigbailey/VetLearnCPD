import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Activity,
  AlertTriangle,
  Beaker,
  Calculator,
  Clock,
  Droplets,
  HeartPulse,
  Search,
  ShieldAlert,
  Syringe
} from "lucide-react";
import PageBanner from "../components/PageBanner";
import HeartbeatLoader from "../components/HeartbeatLoader";
import { supabase } from "../supabaseClient";

const tabs = [
  { id: "drug", label: "Drug Calculator", icon: Calculator },
  { id: "emergency", label: "Emergency Drugs", icon: Syringe },
  { id: "fluids", label: "Fluid Therapy", icon: Droplets },
  { id: "transfusion", label: "Blood Transfusion", icon: HeartPulse },
  { id: "cri", label: "CRI Calculator", icon: Activity },
  { id: "toxicology", label: "Toxicology", icon: ShieldAlert },
  { id: "history", label: "History 24h", icon: Clock }
];

const speciesOptions = ["Dog", "Cat", "Rabbit", "Horse", "Other"];

const panelClass = (darkMode) =>
  darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

const fieldClass = (darkMode) =>
  `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${
    darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247] placeholder:text-slate-500"
  }`;

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatNumber = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
};

const firstBySpecies = (rows, species) => rows.find((row) => row.species === species) || rows[0] || null;

export default function ClinicalTools({ user, darkMode = false, showBanner = true }) {
  const [activeTab, setActiveTab] = useState("drug");
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [data, setData] = useState({
    drugCalculators: [],
    criProtocols: [],
    emergencyDrugs: [],
    fluidCalculators: [],
    transfusionCalculators: [],
    toxicities: []
  });

  useEffect(() => {
    loadClinicalTools();
  }, []);

  useEffect(() => {
    loadCalculationHistory();
  }, [user?.id]);

  const loadClinicalTools = async () => {
    setLoading(true);
    const [drugCalculators, criProtocols, emergencyDrugs, fluidCalculators, transfusionCalculators, toxicities] = await Promise.all([
      supabase.from("drug_calculators").select("*").order("drug_name"),
      supabase.from("cri_protocols").select("*").order("drug_name"),
      supabase.from("emergency_drug_calculator").select("*").order("drug_name"),
      supabase.from("fluid_calculators").select("*").order("calculation_name"),
      supabase.from("transfusion_calculators").select("*").order("species"),
      supabase.from("species_toxicities").select("*").order("toxin")
    ]);

    const errors = [drugCalculators, criProtocols, emergencyDrugs, fluidCalculators, transfusionCalculators, toxicities].filter((result) => result.error);
    if (errors.length) toast.error("Clinical tools need the Supabase calculator SQL first");

    setData({
      drugCalculators: drugCalculators.data || [],
      criProtocols: criProtocols.data || [],
      emergencyDrugs: emergencyDrugs.data || [],
      fluidCalculators: fluidCalculators.data || [],
      transfusionCalculators: transfusionCalculators.data || [],
      toxicities: toxicities.data || []
    });
    setLoading(false);
  };

  const loadCalculationHistory = async () => {
    if (!user?.id) return;
    setHistoryLoading(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: logs, error } = await supabase
      .from("calculator_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (error) toast.error("Could not load calculation history");
    else setHistory(logs || []);
    setHistoryLoading(false);
  };

  const logCalculation = async ({ calculator_type, drug_name, patient_weight, result }) => {
    if (!user?.id) return;
    const { error } = await supabase.from("calculator_logs").insert({
      user_id: user.id,
      calculator_type,
      drug_name: drug_name || null,
      patient_weight: patient_weight || null,
      result
    });
    if (error) {
      toast.error("Could not save calculation history");
      return;
    }
    loadCalculationHistory();
  };

  return (
    <div className="space-y-6 pb-8">
      {showBanner && (
        <PageBanner
          title="Clinical Tools"
          subtitle="Calculate doses, CRIs, fluids, transfusions and toxicology guidance."
          darkMode={darkMode}
          badges={[{ label: "Clinical calculators", icon: <Calculator size={14} />, accent: true }]}
        />
      )}

      <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition flex items-center gap-2 shrink-0 ${
                activeTab === tab.id
                  ? "bg-[#71CFC2] text-[#062F63] shadow-md"
                  : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"
              }`}
            >
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className={`${panelClass(darkMode)} flex flex-col items-center justify-center py-16 gap-4`}>
          <HeartbeatLoader size={72} />
          <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2]">Loading Clinical Tools...</p>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {activeTab === "drug" && <DrugCalculator rows={data.drugCalculators} darkMode={darkMode} onLog={logCalculation} />}
          {activeTab === "emergency" && <EmergencyCalculator rows={data.emergencyDrugs} darkMode={darkMode} onLog={logCalculation} />}
          {activeTab === "fluids" && <FluidCalculator rows={data.fluidCalculators} darkMode={darkMode} onLog={logCalculation} />}
          {activeTab === "transfusion" && <TransfusionCalculator rows={data.transfusionCalculators} darkMode={darkMode} onLog={logCalculation} />}
          {activeTab === "cri" && <CriCalculator rows={data.criProtocols} darkMode={darkMode} onLog={logCalculation} />}
          {activeTab === "toxicology" && <Toxicology rows={data.toxicities} darkMode={darkMode} />}
          {activeTab === "history" && <CalculationHistory rows={history} loading={historyLoading} darkMode={darkMode} onRefresh={loadCalculationHistory} />}
        </div>
      )}
    </div>
  );
}

function DrugCalculator({ rows, darkMode, onLog }) {
  const [species, setSpecies] = useState("Dog");
  const [weight, setWeight] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [dose, setDose] = useState("");

  const speciesRows = useMemo(() => rows.filter((row) => row.species === species), [rows, species]);
  const selected = speciesRows.find((row) => String(row.id) === String(selectedId)) || firstBySpecies(speciesRows, species);

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(String(selected.id));
  }, [selected, selectedId]);

  useEffect(() => {
    if (selected) setDose(selected.min_dose || selected.max_dose || "");
  }, [selected?.id]);

  const doseValue = numberValue(dose || selected?.min_dose);
  const weightValue = numberValue(weight);
  const totalDose = weightValue * doseValue;
  const volume = selected?.concentration ? totalDose / numberValue(selected.concentration) : null;

  const saveLog = () => {
    if (!selected || weightValue <= 0) return toast.error("Add a weight and select a drug");
    const result = `${formatNumber(totalDose)} ${selected.dose_unit?.split("/")[0] || "mg"}${volume ? `, give ${formatNumber(volume)} ml` : ""}`;
    onLog({ calculator_type: "drug", drug_name: selected.drug_name, patient_weight: weightValue, result });
    toast.success("Calculation logged");
  };

  return (
    <ToolShell darkMode={darkMode} title="Drug Calculator" icon={<Calculator size={20} />} subtitle="Calculate dose and volume from weight, dose rate and product concentration.">
      <SpeciesWeight species={species} setSpecies={(value) => { setSpecies(value); setSelectedId(""); }} weight={weight} setWeight={setWeight} darkMode={darkMode} />
      <select className={fieldClass(darkMode)} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
        {speciesRows.length === 0 && <option value="">No drugs for this species</option>}
        {speciesRows.map((row) => <option key={row.id} value={row.id}>{row.drug_name} {row.route ? `(${row.route})` : ""}</option>)}
      </select>
      {selected && (
        <>
          <DoseRange row={selected} dose={dose} setDose={setDose} darkMode={darkMode} />
          <ResultGrid items={[
            ["Dose", `${formatNumber(totalDose)} ${selected.dose_unit?.split("/")[0] || "mg"}`],
            ["Give", volume ? `${formatNumber(volume)} ml` : "No concentration"]
          ]} />
          <Notes row={selected} />
          <LogButton onClick={saveLog} />
        </>
      )}
    </ToolShell>
  );
}

function EmergencyCalculator({ rows, darkMode, onLog }) {
  const [weight, setWeight] = useState("");
  const [selectedId, setSelectedId] = useState(rows[0]?.id || "");
  const [dose, setDose] = useState("");
  const selected = rows.find((row) => String(row.id) === String(selectedId)) || rows[0];

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(String(selected.id));
  }, [selected, selectedId]);

  useEffect(() => {
    if (selected) setDose(selected.dose_min || selected.dose_max || "");
  }, [selected?.id]);

  const doseValue = numberValue(dose || selected?.dose_min);
  const weightValue = numberValue(weight);
  const totalDose = weightValue * doseValue;
  const volume = selected?.concentration ? totalDose / numberValue(selected.concentration) : null;

  const saveLog = () => {
    if (!selected || weightValue <= 0) return toast.error("Add a weight and select a drug");
    const result = `${formatNumber(totalDose)} ${selected.dose_unit?.split("/")[0] || "mg"}${volume ? `, give ${formatNumber(volume)} ml` : ""}`;
    onLog({ calculator_type: "emergency", drug_name: selected.drug_name, patient_weight: weightValue, result });
    toast.success("Emergency calculation logged");
  };

  return (
    <ToolShell darkMode={darkMode} title="Emergency Drug Calculator" icon={<Syringe size={20} />} subtitle="Fast weight-based emergency drug volumes.">
      <input className={fieldClass(darkMode)} type="number" placeholder="Patient weight kg" value={weight} onChange={(event) => setWeight(event.target.value)} />
      <select className={fieldClass(darkMode)} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
        {rows.length === 0 && <option value="">No emergency drugs loaded</option>}
        {rows.map((row) => <option key={row.id} value={row.id}>{row.drug_name} {row.indication ? `- ${row.indication}` : ""}</option>)}
      </select>
      {selected && (
        <>
          <DoseRange row={{ ...selected, min_dose: selected.dose_min, max_dose: selected.dose_max }} dose={dose} setDose={setDose} darkMode={darkMode} />
          <ResultGrid items={[
            ["Dose", `${formatNumber(totalDose)} ${selected.dose_unit?.split("/")[0] || "mg"}`],
            ["Give", volume ? `${formatNumber(volume)} ml` : "No concentration"]
          ]} />
          <Notes row={selected} />
          <LogButton onClick={saveLog} />
        </>
      )}
    </ToolShell>
  );
}

function CriCalculator({ rows, darkMode, onLog }) {
  const [weight, setWeight] = useState("");
  const [selectedId, setSelectedId] = useState(rows[0]?.id || "");
  const [rate, setRate] = useState("");
  const selected = rows.find((row) => String(row.id) === String(selectedId)) || rows[0];

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(String(selected.id));
  }, [selected, selectedId]);

  useEffect(() => {
    if (selected) setRate(selected.cri_rate_min || selected.cri_rate_max || "");
  }, [selected?.id]);

  const weightValue = numberValue(weight);
  const rateValue = numberValue(rate || selected?.cri_rate_min);
  const unit = String(selected?.rate_unit || "mcg/kg/min").toLowerCase();
  let mgPerHour = 0;

  if (unit.includes("mcg") && unit.includes("min")) mgPerHour = (weightValue * rateValue / 1000) * 60;
  else if (unit.includes("mcg") && unit.includes("hr")) mgPerHour = weightValue * rateValue / 1000;
  else if (unit.includes("mg") && unit.includes("min")) mgPerHour = weightValue * rateValue * 60;
  else mgPerHour = weightValue * rateValue;

  const mgPerMin = mgPerHour / 60;
  const mlPerHour = selected?.concentration ? mgPerHour / numberValue(selected.concentration) : null;

  const saveLog = () => {
    if (!selected || weightValue <= 0) return toast.error("Add a weight and select a CRI");
    const result = `${formatNumber(mgPerHour)} mg/hr${mlPerHour ? `, ${formatNumber(mlPerHour)} ml/hr` : ""}`;
    onLog({ calculator_type: "cri", drug_name: selected.drug_name, patient_weight: weightValue, result });
    toast.success("CRI calculation logged");
  };

  return (
    <ToolShell darkMode={darkMode} title="CRI Calculator" icon={<Activity size={20} />} subtitle="Calculate continuous rate infusion delivery rates.">
      <input className={fieldClass(darkMode)} type="number" placeholder="Patient weight kg" value={weight} onChange={(event) => setWeight(event.target.value)} />
      <select className={fieldClass(darkMode)} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
        {rows.length === 0 && <option value="">No CRI protocols loaded</option>}
        {rows.map((row) => <option key={row.id} value={row.id}>{row.drug_name} {row.indication ? `- ${row.indication}` : ""}</option>)}
      </select>
      {selected && (
        <>
          <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
            <input className={fieldClass(darkMode)} type="number" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="CRI rate" />
            <span className="text-sm font-black opacity-70">{selected.rate_unit || "mcg/kg/min"}</span>
          </div>
          <ResultGrid items={[
            ["mg/min", `${formatNumber(mgPerMin, 3)} mg/min`],
            ["mg/hr", `${formatNumber(mgPerHour)} mg/hr`],
            ["Pump rate", mlPerHour ? `${formatNumber(mlPerHour)} ml/hr` : "No concentration"]
          ]} />
          <InfoLine label="Loading dose" value={selected.loading_dose} />
          <InfoLine label="Dilution" value={selected.dilution} />
          <InfoLine label="Monitoring" value={selected.monitoring} />
          <Notes row={selected} />
          <LogButton onClick={saveLog} />
        </>
      )}
    </ToolShell>
  );
}

function FluidCalculator({ rows, darkMode, onLog }) {
  const [species, setSpecies] = useState("Dog");
  const [weight, setWeight] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const speciesRows = rows.filter((row) => !row.species || row.species === species);
  const selected = speciesRows.find((row) => String(row.id) === String(selectedId)) || speciesRows[0];

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(String(selected.id));
  }, [selected, selectedId]);

  const weightValue = numberValue(weight);
  const multiplier = parseFormulaMultiplier(selected?.formula);
  const volume = weightValue * multiplier;
  const hourly = volume / 24;

  const saveLog = () => {
    if (!selected || weightValue <= 0) return toast.error("Add a weight and select a fluid calculation");
    const result = `${formatNumber(volume)} ml total${selected.calculation_name?.toLowerCase().includes("maintenance") ? `, ${formatNumber(hourly)} ml/hr` : ""}`;
    onLog({ calculator_type: "fluid", drug_name: selected.calculation_name, patient_weight: weightValue, result });
    toast.success("Fluid calculation logged");
  };

  return (
    <ToolShell darkMode={darkMode} title="Fluid Therapy Calculator" icon={<Droplets size={20} />} subtitle="Calculate maintenance and shock fluid volumes.">
      <SpeciesWeight species={species} setSpecies={(value) => { setSpecies(value); setSelectedId(""); }} weight={weight} setWeight={setWeight} darkMode={darkMode} />
      <select className={fieldClass(darkMode)} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
        {speciesRows.length === 0 && <option value="">No fluid formulas loaded</option>}
        {speciesRows.map((row) => <option key={row.id} value={row.id}>{row.calculation_name} ({row.formula})</option>)}
      </select>
      {selected && (
        <>
          <ResultGrid items={[
            ["Volume", `${formatNumber(volume)} ml`],
            ["Hourly", selected.calculation_name?.toLowerCase().includes("maintenance") ? `${formatNumber(hourly)} ml/hr` : "Not maintenance"]
          ]} />
          <InfoLine label="Formula" value={selected.formula} />
          <Notes row={selected} />
          <LogButton onClick={saveLog} />
        </>
      )}
    </ToolShell>
  );
}

function TransfusionCalculator({ rows, darkMode, onLog }) {
  const [species, setSpecies] = useState("Dog");
  const [weight, setWeight] = useState("");
  const [currentPcv, setCurrentPcv] = useState("");
  const [targetPcv, setTargetPcv] = useState("");
  const [donorPcv, setDonorPcv] = useState("60");
  const selected = rows.find((row) => row.species === species) || rows[0];

  const volume = numberValue(weight) * numberValue(selected?.blood_volume_factor) * (numberValue(targetPcv) - numberValue(currentPcv)) / Math.max(numberValue(donorPcv), 1);

  const saveLog = () => {
    if (!selected || numberValue(weight) <= 0) return toast.error("Add weight and PCV values");
    const result = `${formatNumber(Math.max(volume, 0))} ml blood product`;
    onLog({ calculator_type: "transfusion", drug_name: `${species} transfusion`, patient_weight: numberValue(weight), result });
    toast.success("Transfusion calculation logged");
  };

  return (
    <ToolShell darkMode={darkMode} title="Blood Transfusion Calculator" icon={<HeartPulse size={20} />} subtitle="Estimate transfusion volume from blood volume factor and PCV change.">
      <SpeciesWeight species={species} setSpecies={setSpecies} weight={weight} setWeight={setWeight} darkMode={darkMode} />
      <div className="grid grid-cols-3 gap-3">
        <input className={fieldClass(darkMode)} type="number" placeholder="Current PCV" value={currentPcv} onChange={(event) => setCurrentPcv(event.target.value)} />
        <input className={fieldClass(darkMode)} type="number" placeholder="Target PCV" value={targetPcv} onChange={(event) => setTargetPcv(event.target.value)} />
        <input className={fieldClass(darkMode)} type="number" placeholder="Donor PCV" value={donorPcv} onChange={(event) => setDonorPcv(event.target.value)} />
      </div>
      <ResultGrid items={[["Volume", `${formatNumber(Math.max(volume, 0))} ml`], ["Factor", selected?.blood_volume_factor ? `${selected.blood_volume_factor} ml/kg` : "Not loaded"]]} />
      <Notes row={selected} />
      <LogButton onClick={saveLog} />
    </ToolShell>
  );
}

function Toxicology({ rows, darkMode }) {
  const [search, setSearch] = useState("");
  const [species, setSpecies] = useState("All");

  const filtered = rows.filter((row) => {
    const matchesSpecies = species === "All" || row.species === species;
    const q = search.toLowerCase().trim();
    const matchesSearch = !q || [row.toxin, row.species, row.toxic_dose, row.clinical_signs, row.antidote, row.notes].some((value) => String(value || "").toLowerCase().includes(q));
    return matchesSpecies && matchesSearch;
  });

  return (
    <ToolShell darkMode={darkMode} title="Species Toxicities" icon={<ShieldAlert size={20} />} subtitle="Search common toxicities, signs and antidotes.">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={17} className="absolute left-3 top-3.5 opacity-45" />
          <input className={`${fieldClass(darkMode)} pl-10`} placeholder="Search toxin, signs or antidote..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select className={`${fieldClass(darkMode)} max-w-[120px]`} value={species} onChange={(event) => setSpecies(event.target.value)}>
          <option>All</option>
          {speciesOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <p className="text-sm opacity-60">No toxicology records found.</p>}
        {filtered.map((row) => (
          <div key={row.id} className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="font-black text-lg">{row.toxin}</h3>
                <p className="text-sm opacity-65">{row.species}</p>
              </div>
              <AlertTriangle size={18} className="text-amber-500 shrink-0" />
            </div>
            <InfoLine label="Toxic dose" value={row.toxic_dose} />
            <InfoLine label="Clinical signs" value={row.clinical_signs} />
            <InfoLine label="Antidote" value={row.antidote} />
            <Notes row={row} />
          </div>
        ))}
      </div>
    </ToolShell>
  );
}

function CalculationHistory({ rows, loading, darkMode, onRefresh }) {
  return (
    <ToolShell darkMode={darkMode} title="Calculation History" icon={<Clock size={20} />} subtitle="Calculations logged from Clinical Tools in the last 24 hours.">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm opacity-60">{rows.length} calculation{rows.length === 1 ? "" : "s"} in the last 24 hours</p>
        <button onClick={onRefresh} className="rounded-lg bg-[#E8F8F5] text-[#0B3760] px-3 py-2 text-xs font-black">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><HeartbeatLoader size={48} /></div>
      ) : rows.length === 0 ? (
        <div className={`rounded-lg border p-4 text-center text-sm opacity-65 ${darkMode ? "border-white/10 bg-white/5" : "border-[#DCEDEA] bg-[#F9FCFB]"}`}>
          No calculations logged in the last 24 hours.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <h3 className="font-black text-base truncate">{row.drug_name || readableCalculatorType(row.calculator_type)}</h3>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-45">{readableCalculatorType(row.calculator_type)}</p>
                </div>
                <span className="text-xs font-bold opacity-55 whitespace-nowrap">{new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="text-sm leading-6 font-bold text-[#0F8F83]">{row.result}</p>
              {row.patient_weight && <p className="text-xs opacity-55 mt-2">Patient weight: {row.patient_weight} kg</p>}
            </div>
          ))}
        </div>
      )}
    </ToolShell>
  );
}

function readableCalculatorType(type) {
  const labels = {
    drug: "Drug Calculator",
    emergency: "Emergency Drugs",
    fluid: "Fluid Therapy",
    transfusion: "Blood Transfusion",
    cri: "CRI Calculator"
  };
  return labels[type] || "Calculator";
}

function ToolShell({ darkMode, title, subtitle, icon, children }) {
  return (
    <section className={`${panelClass(darkMode)} space-y-4`}>
      <div className="flex items-start gap-3">
        <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3 shrink-0`}>{icon}</div>
        <div>
          <h2 className="font-black text-xl leading-tight">{title}</h2>
          <p className="text-sm opacity-60 leading-6">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SpeciesWeight({ species, setSpecies, weight, setWeight, darkMode }) {
  return (
    <div className="grid grid-cols-[1fr_1fr] gap-3">
      <select className={fieldClass(darkMode)} value={species} onChange={(event) => setSpecies(event.target.value)}>
        {speciesOptions.map((option) => <option key={option}>{option}</option>)}
      </select>
      <input className={fieldClass(darkMode)} type="number" placeholder="Weight kg" value={weight} onChange={(event) => setWeight(event.target.value)} />
    </div>
  );
}

function DoseRange({ row, dose, setDose, darkMode }) {
  const min = numberValue(row.min_dose || row.dose_min);
  const max = Math.max(numberValue(row.max_dose || row.dose_max, min), min || 1);
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-3 text-xs font-black uppercase tracking-widest opacity-55">
        <span>Dose rate</span>
        <span>{row.dose_unit || "mg/kg"}</span>
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-3 items-center">
        <input type="range" min={min} max={max} step="0.01" value={dose || min} onChange={(event) => setDose(event.target.value)} className="accent-[#71CFC2]" />
        <input className={`${fieldClass(darkMode)} text-center`} type="number" step="0.01" value={dose} onChange={(event) => setDose(event.target.value)} />
      </div>
      <p className="text-xs opacity-55">Range: {row.min_dose || row.dose_min} - {row.max_dose || row.dose_max} {row.dose_unit || "mg/kg"}</p>
    </div>
  );
}

function ResultGrid({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-[#0F8F83]/10 text-[#0B3760] dark:text-[#71CFC2] p-4 text-center">
          <div className="text-xs font-black uppercase tracking-widest opacity-60 mb-1">{label}</div>
          <div className="font-black text-xl">{value}</div>
        </div>
      ))}
    </div>
  );
}

function InfoLine({ label, value }) {
  if (!value) return null;
  return <p className="text-sm leading-6"><span className="font-black opacity-60">{label}: </span>{value}</p>;
}

function Notes({ row }) {
  if (!row?.notes) return null;
  return <p className="text-sm leading-6 opacity-70"><span className="font-black">Notes: </span>{row.notes}</p>;
}

function LogButton({ onClick }) {
  return <button onClick={onClick} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black flex items-center justify-center gap-2"><Beaker size={18} /> Log calculation</button>;
}

function parseFormulaMultiplier(formula) {
  const text = String(formula || "").toLowerCase();
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:x|\*)\s*bw/);
  if (match) return numberValue(match[1]);
  const leading = text.match(/^([0-9]+(?:\.[0-9]+)?)/);
  return leading ? numberValue(leading[1]) : 0;
}
