import { useRef, useState } from "react";
import { Activity, ArrowRightLeft, Calculator, Droplets, Flame, Gauge, GlassWater, Pill, Syringe } from "lucide-react";
import { ToolTileGrid } from "./VetLearnUI";

const quickCalculatorOptions = [
  { id: "drug", label: "Main Drug", fullLabel: "Main Drug Calculator", icon: Calculator },
  { id: "prednisolone", label: "Pred Taper", fullLabel: "Prednisolone Taper", icon: Pill },
  { id: "energy", label: "Energy", fullLabel: "Energy", icon: Flame },
  { id: "convert", label: "Units", fullLabel: "Unit Conversion", icon: ArrowRightLeft },
  { id: "dextrose", label: "Dextrose", fullLabel: "Dextrose", icon: Droplets },
  { id: "potassium", label: "Potassium", fullLabel: "Potassium", icon: Syringe },
  { id: "sodium", label: "Sodium", fullLabel: "Sodium", icon: GlassWater },
  { id: "osmolality", label: "Osmolality", fullLabel: "Osmolality", icon: Gauge }
];

const unitConversions = {
  weight: [
    { from: "g", to: "kg", factor: 0.001 },
    { from: "kg", to: "g", factor: 1000 }
  ],
  dose: [
    { from: "mg", to: "mcg", factor: 1000 },
    { from: "mcg", to: "mg", factor: 0.001 },
    { from: "g", to: "mg", factor: 1000 },
    { from: "mg", to: "g", factor: 0.001 }
  ],
  volume: [
    { from: "ml", to: "L", factor: 0.001 },
    { from: "L", to: "ml", factor: 1000 }
  ]
};

const prednisoloneTaperStages = [
  { label: "Give", min: 0.5, max: 1, frequency: "PO every 24 hours for 7 days" },
  { label: "Then Give", min: 0.25, max: 0.5, frequency: "PO every 24 hours for 7 days" },
  { label: "Then Give", min: 0.25, max: 0.5, frequency: "PO every other day for 14 days" }
];

const drugCalculatorRows = [
  { key: "meloxicam-dog-po", drug_name: "Meloxicam", species: "Dog", min_dose: 0.1, max_dose: 0.2, dose_unit: "mg/kg", route: "PO", concentration: 1.5, concentration_unit: "mg/ml", notes: "Use current formulary guidance for duration and patient risk factors." },
  { key: "meloxicam-cat-po", drug_name: "Meloxicam", species: "Cat", min_dose: 0.05, max_dose: 0.05, dose_unit: "mg/kg", route: "PO", concentration: 0.5, concentration_unit: "mg/ml", notes: "Use with caution and current local guidance." },
  { key: "methadone-dog-iv-im", drug_name: "Methadone", species: "Dog", min_dose: 0.2, max_dose: 0.4, dose_unit: "mg/kg", route: "IV/IM", concentration: 10, concentration_unit: "mg/ml", notes: "Monitor sedation and respiratory status." },
  { key: "buprenorphine-cat-iv-im-buccal", drug_name: "Buprenorphine", species: "Cat", min_dose: 0.01, max_dose: 0.02, dose_unit: "mg/kg", route: "IV/IM/Buccal", concentration: 0.3, concentration_unit: "mg/ml", notes: "Dose route and formulation dependent." }
];

const drugCalculatorSpecies = [...new Set(drugCalculatorRows.map((row) => row.species))];

const panelClass = (darkMode) =>
  darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

const fieldClass = (darkMode) =>
  `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${
    darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247] placeholder:text-slate-500"
  }`;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatNumber = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return "0";
  return String(Number(value.toFixed(decimals)));
};

const gramsToKg = (grams) => toNumber(grams) / 1000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normaliseCalculatorId = (id) => id === "basic" ? "drug" : id;

const activeOptionFor = (id) => quickCalculatorOptions.find((item) => item.id === normaliseCalculatorId(id)) || quickCalculatorOptions[0];

const initialCalculator = (storageKey, fallback) => {
  if (!storageKey || typeof window === "undefined") return fallback;
  const stored = normaliseCalculatorId(window.localStorage.getItem(storageKey));
  return quickCalculatorOptions.some((item) => item.id === stored) ? stored : fallback;
};

export function QuickCalculatorPanel({
  darkMode = false,
  compact = false,
  storageKey = "",
  defaultCalculator = "drug",
  className = ""
}) {
  const resultRef = useRef(null);
  const [active, setActive] = useState(() => initialCalculator(storageKey, defaultCalculator));
  const activeCalculator = activeOptionFor(active);
  const ActiveIcon = activeCalculator.icon;

  const selectCalculator = (id) => {
    setActive(id);
    if (storageKey) window.localStorage.setItem(storageKey, id);
    if (!compact) {
      window.requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  if (compact) {
    return (
      <section className={`${panelClass(darkMode)} space-y-4 ${className}`}>
        <div className="flex items-start gap-3">
          <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3 shrink-0`}>
            <ActiveIcon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-lg leading-tight">Calculator Widget</h2>
            <p className="text-sm opacity-60 leading-6">Choose a quick calculator for this dashboard slot.</p>
          </div>
        </div>

        <select className={fieldClass(darkMode)} value={active} onChange={(event) => selectCalculator(event.target.value)}>
          {quickCalculatorOptions.map((item) => <option key={item.id} value={item.id}>{item.fullLabel}</option>)}
        </select>

        <QuickCalculatorBody active={active} darkMode={darkMode} compact />
      </section>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <section className={`${panelClass(darkMode)} space-y-4`}>
        <div className="flex items-start gap-3">
          <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3 shrink-0`}>
            <Activity size={20} />
          </div>
          <div>
            <h2 className="font-black text-xl leading-tight">Additional Calculators</h2>
            <p className="text-sm opacity-60 leading-6">Common quick calculators for small animal clinical work.</p>
          </div>
        </div>

        <ToolTileGrid className="grid-cols-3">
          {quickCalculatorOptions.map((item) => (
            <QuickCalculatorTile
              key={item.id}
              icon={item.icon}
              title={item.label}
              active={active === item.id}
              darkMode={darkMode}
              onClick={() => selectCalculator(item.id)}
            />
          ))}
        </ToolTileGrid>
      </section>

      <section ref={resultRef} className={`${panelClass(darkMode)} scroll-mt-24 space-y-4`}>
        <div className="flex items-start gap-3">
          <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3 shrink-0`}>
            <ActiveIcon size={20} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest opacity-45">Additional calculator</p>
            <h2 className="font-black text-xl leading-tight">{activeCalculator.fullLabel}</h2>
          </div>
        </div>

        <div className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
          <QuickCalculatorBody active={active} darkMode={darkMode} />
        </div>
      </section>
    </div>
  );
}

function QuickCalculatorBody({ active, darkMode, compact = false }) {
  const activeCalculator = normaliseCalculatorId(active);
  return (
    <>
      {activeCalculator === "drug" && <MainDrugCalculator darkMode={darkMode} />}
      {activeCalculator === "prednisolone" && <PrednisoloneTaperCalculator darkMode={darkMode} compact={compact} />}
      {activeCalculator === "energy" && <EnergyCalculator darkMode={darkMode} />}
      {activeCalculator === "convert" && <UnitConversion darkMode={darkMode} />}
      {activeCalculator === "dextrose" && <DextroseCalculator darkMode={darkMode} />}
      {activeCalculator === "potassium" && <PotassiumCalculator darkMode={darkMode} />}
      {activeCalculator === "sodium" && <SodiumCalculator darkMode={darkMode} />}
      {activeCalculator === "osmolality" && <OsmolalityCalculator darkMode={darkMode} />}
    </>
  );
}

function MainDrugCalculator({ darkMode }) {
  const [species, setSpecies] = useState("Dog");
  const [selectedKey, setSelectedKey] = useState("meloxicam-dog-po");
  const [weightKg, setWeightKg] = useState("");
  const [dose, setDose] = useState("");
  const speciesRows = drugCalculatorRows.filter((row) => row.species === species);
  const selected = speciesRows.find((row) => row.key === selectedKey) || speciesRows[0];
  const minDose = toNumber(selected?.min_dose);
  const maxDose = Math.max(toNumber(selected?.max_dose, minDose), minDose || 1);
  const doseValue = selected ? clamp(toNumber(dose || minDose, minDose), minDose, maxDose) : 0;
  const weightValue = toNumber(weightKg);
  const totalDose = weightValue * doseValue;
  const volume = selected?.concentration ? totalDose / toNumber(selected.concentration) : null;

  const changeSpecies = (nextSpecies) => {
    const nextRow = drugCalculatorRows.find((row) => row.species === nextSpecies);
    setSpecies(nextSpecies);
    setSelectedKey(nextRow?.key || "");
    setDose(nextRow ? String(nextRow.min_dose) : "");
  };

  const changeDrug = (nextKey) => {
    const nextRow = drugCalculatorRows.find((row) => row.key === nextKey);
    setSelectedKey(nextKey);
    setDose(nextRow ? String(nextRow.min_dose) : "");
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <select className={fieldClass(darkMode)} value={species} onChange={(event) => changeSpecies(event.target.value)}>
          {drugCalculatorSpecies.map((option) => <option key={option}>{option}</option>)}
        </select>
        <label className="relative">
          <input className={`${fieldClass(darkMode)} pr-10 text-center`} type="number" inputMode="decimal" placeholder="Weight" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} />
          <span className="absolute right-3 top-3 text-sm font-black opacity-60">kg</span>
        </label>
      </div>

      <select className={fieldClass(darkMode)} value={selected?.key || ""} onChange={(event) => changeDrug(event.target.value)}>
        {speciesRows.map((row) => <option key={row.key} value={row.key}>{row.drug_name} {row.route ? `(${row.route})` : ""}</option>)}
      </select>

      {selected && (
        <>
          <div className="space-y-2">
            <div className="flex justify-between gap-3 text-xs font-black uppercase tracking-widest opacity-55">
              <span>Dose rate</span>
              <span>{selected.dose_unit || "mg/kg"}</span>
            </div>
            <div className="grid grid-cols-[1fr_96px] gap-3 items-center">
              <input type="range" min={minDose} max={maxDose} step="0.01" value={doseValue} onChange={(event) => setDose(event.target.value)} className="accent-[#71CFC2]" />
              <input className={`${fieldClass(darkMode)} text-center`} type="number" step="0.01" value={dose || minDose} onChange={(event) => setDose(event.target.value)} />
            </div>
            <p className="text-xs opacity-55">Range: {formatNumber(minDose)} - {formatNumber(maxDose)} {selected.dose_unit || "mg/kg"}</p>
          </div>

          <ResultGrid items={[
            ["Dose", `${formatNumber(totalDose)} ${selected.dose_unit?.split("/")[0] || "mg"}`],
            ["Give", volume ? `${formatNumber(volume)} ml` : "No concentration"]
          ]} />
          <p className="text-xs leading-5 opacity-60">{selected.drug_name} | {selected.species} | {selected.route} | {selected.concentration} {selected.concentration_unit}</p>
        </>
      )}
    </div>
  );
}

function QuickCalculatorTile({ icon: Icon, title, active, darkMode, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-[96px] rounded-lg border border-transparent p-3 flex flex-col items-center justify-center gap-2 text-center font-black transition overflow-hidden ${
        active
          ? "bg-[#71CFC2] text-[#062F63] shadow-sm"
          : darkMode
            ? "bg-white/10 text-slate-100 hover:bg-white/15"
            : "bg-[#E8F8F5] text-[#0B3760] hover:bg-[#DFF4F1]"
      }`}
    >
      {Icon && <Icon size={22} className="shrink-0" />}
      <span className="text-sm leading-tight line-clamp-2">{title}</span>
    </button>
  );
}

function PrednisoloneTaperCalculator({ darkMode, compact = false }) {
  const [species, setSpecies] = useState("Cat");
  const [weightKg, setWeightKg] = useState("");
  const weightValue = toNumber(weightKg);

  return (
    <div className="space-y-3">
      <select className={fieldClass(darkMode)} value={species} onChange={(event) => setSpecies(event.target.value)}>
        <option>Cat</option>
        <option>Dog</option>
      </select>

      <label className="relative">
        <input className={`${fieldClass(darkMode)} pr-10 text-center`} type="number" inputMode="decimal" placeholder="Weight" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} />
        <span className="absolute right-3 top-3 text-sm font-black opacity-60">kg</span>
      </label>

      <div className="space-y-3">
        {prednisoloneTaperStages.map((stage) => (
          <PredDoseCard key={`${stage.label}-${stage.frequency}`} stage={stage} weightKg={weightValue} darkMode={darkMode} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function PredDoseCard({ stage, weightKg, darkMode, compact }) {
  const minMg = weightKg * stage.min;
  const maxMg = weightKg * stage.max;
  const doseClass = compact ? "text-xl" : "text-2xl";

  return (
    <div className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h4 className="font-black text-sm">{stage.label}</h4>
          <p className="text-xs opacity-60 mt-1">{stage.frequency}</p>
        </div>
        <span className="text-xs font-black uppercase tracking-widest opacity-45">PO</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-[#0F8F83]/10 text-[#0B3760] dark:text-[#71CFC2] p-3 text-center">
        <div className={`${doseClass} font-black`}>{formatNumber(minMg)} mg</div>
        <div className="text-sm font-black opacity-60">to</div>
        <div className={`${doseClass} font-black`}>{formatNumber(maxMg)} mg</div>
      </div>
    </div>
  );
}

function EnergyCalculator({ darkMode }) {
  const [weightGrams, setWeightGrams] = useState("");
  const [factor, setFactor] = useState("1.2");
  const kg = gramsToKg(weightGrams);
  const rer = kg > 0 ? 70 * Math.pow(kg, 0.75) : 0;
  const mer = rer * toNumber(factor, 1);

  return (
    <div className="space-y-3">
      <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Body weight g" value={weightGrams} onChange={(event) => setWeightGrams(event.target.value)} />
      <select className={fieldClass(darkMode)} value={factor} onChange={(event) => setFactor(event.target.value)}>
        <option value="1">Weight loss / inpatient: 1.0 x RER</option>
        <option value="1.2">Neutered adult: 1.2 x RER</option>
        <option value="1.6">Intact adult: 1.6 x RER</option>
        <option value="2">Growth / high demand: 2.0 x RER</option>
      </select>
      <ResultGrid items={[["RER", `${formatNumber(rer)} kcal/day`], ["MER", `${formatNumber(mer)} kcal/day`]]} />
    </div>
  );
}

function UnitConversion({ darkMode }) {
  const [group, setGroup] = useState("weight");
  const [index, setIndex] = useState("0");
  const [value, setValue] = useState("");
  const conversion = unitConversions[group][Number(index)] || unitConversions[group][0];
  const result = toNumber(value) * conversion.factor;

  return (
    <div className="space-y-3">
      <select className={fieldClass(darkMode)} value={group} onChange={(event) => { setGroup(event.target.value); setIndex("0"); }}>
        <option value="weight">Weight</option>
        <option value="dose">Dose</option>
        <option value="volume">Volume</option>
      </select>
      <select className={fieldClass(darkMode)} value={index} onChange={(event) => setIndex(event.target.value)}>
        {unitConversions[group].map((item, itemIndex) => <option key={`${item.from}-${item.to}`} value={itemIndex}>{item.from} to {item.to}</option>)}
      </select>
      <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder={`Value in ${conversion.from}`} value={value} onChange={(event) => setValue(event.target.value)} />
      <ResultGrid items={[[conversion.to, `${formatNumber(result, 4)} ${conversion.to}`]]} />
    </div>
  );
}

function DextroseCalculator({ darkMode }) {
  const [volume, setVolume] = useState("");
  const [target, setTarget] = useState("2.5");
  const [stock, setStock] = useState("50");
  const mlToAdd = (toNumber(target) * toNumber(volume)) / Math.max(toNumber(stock) - toNumber(target), 1);
  const finalVolume = toNumber(volume) + mlToAdd;

  return (
    <div className="space-y-3">
      <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Fluid bag volume ml" value={volume} onChange={(event) => setVolume(event.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Target %" value={target} onChange={(event) => setTarget(event.target.value)} />
        <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Stock %" value={stock} onChange={(event) => setStock(event.target.value)} />
      </div>
      <ResultGrid items={[["Add", `${formatNumber(mlToAdd)} ml`], ["Final volume", `${formatNumber(finalVolume)} ml`]]} />
      <Warning text="Check local protocols before giving concentrated dextrose peripherally." darkMode={darkMode} />
    </div>
  );
}

function PotassiumCalculator({ darkMode }) {
  const [weightGrams, setWeightGrams] = useState("");
  const [rate, setRate] = useState("0.25");
  const [hours, setHours] = useState("6");
  const [stock, setStock] = useState("2");
  const totalMEq = gramsToKg(weightGrams) * toNumber(rate) * toNumber(hours);
  const mlToAdd = totalMEq / Math.max(toNumber(stock), 0.01);
  const highRate = toNumber(rate) > 0.5;

  return (
    <div className="space-y-3">
      <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Body weight g" value={weightGrams} onChange={(event) => setWeightGrams(event.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="mEq/kg/hr" value={rate} onChange={(event) => setRate(event.target.value)} />
        <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Infusion hours" value={hours} onChange={(event) => setHours(event.target.value)} />
      </div>
      <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="KCl stock mEq/ml" value={stock} onChange={(event) => setStock(event.target.value)} />
      <ResultGrid items={[["Potassium", `${formatNumber(totalMEq)} mEq`], ["KCl to add", `${formatNumber(mlToAdd)} ml`]]} />
      <Warning text={highRate ? "This exceeds 0.5 mEq/kg/hr. Recheck patient status and protocol before use." : "Monitor ECG and serum potassium during supplementation."} darkMode={darkMode} strong={highRate} />
    </div>
  );
}

function SodiumCalculator({ darkMode }) {
  const [weightGrams, setWeightGrams] = useState("");
  const [currentNa, setCurrentNa] = useState("");
  const [targetNa, setTargetNa] = useState("");
  const [factor, setFactor] = useState("0.6");
  const change = Math.abs(toNumber(targetNa) - toNumber(currentNa));
  const deficit = toNumber(factor) * gramsToKg(weightGrams) * (toNumber(targetNa) - toNumber(currentNa));
  const minHours = change / 0.5;

  return (
    <div className="space-y-3">
      <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Body weight g" value={weightGrams} onChange={(event) => setWeightGrams(event.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Current Na mmol/L" value={currentNa} onChange={(event) => setCurrentNa(event.target.value)} />
        <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Target Na mmol/L" value={targetNa} onChange={(event) => setTargetNa(event.target.value)} />
      </div>
      <select className={fieldClass(darkMode)} value={factor} onChange={(event) => setFactor(event.target.value)}>
        <option value="0.6">Dog total body water 0.6</option>
        <option value="0.5">Cat total body water 0.5</option>
      </select>
      <ResultGrid items={[["Na change", `${formatNumber(deficit)} mmol`], ["Minimum time", `${formatNumber(minHours, 1)} hr`]]} />
      <Warning text="Avoid rapid sodium correction. Common target is no more than about 0.5 mmol/L/hr unless directed by a specialist protocol." darkMode={darkMode} />
    </div>
  );
}

function OsmolalityCalculator({ darkMode }) {
  const [sodium, setSodium] = useState("");
  const [glucose, setGlucose] = useState("");
  const [urea, setUrea] = useState("");
  const osmolality = (2 * toNumber(sodium)) + toNumber(glucose) + toNumber(urea);

  return (
    <div className="space-y-3">
      <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Sodium mmol/L" value={sodium} onChange={(event) => setSodium(event.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Glucose mmol/L" value={glucose} onChange={(event) => setGlucose(event.target.value)} />
        <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Urea mmol/L" value={urea} onChange={(event) => setUrea(event.target.value)} />
      </div>
      <ResultGrid items={[["Calculated", `${formatNumber(osmolality)} mOsm/kg`]]} />
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

function Warning({ text, darkMode, strong = false }) {
  return (
    <p className={`rounded-lg border p-3 text-sm leading-6 ${strong ? "font-black" : ""} ${darkMode ? "bg-amber-500/10 border-amber-400/20 text-amber-100" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
      {text}
    </p>
  );
}
