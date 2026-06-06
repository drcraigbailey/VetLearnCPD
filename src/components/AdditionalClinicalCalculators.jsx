import { useRef, useState } from "react";
import { Activity, ArrowRightLeft, Droplets, Flame, Gauge, GlassWater, Syringe } from "lucide-react";
import { ToolTileGrid } from "./VetLearnUI";

const calculators = [
  { id: "energy", label: "Energy", icon: Flame },
  { id: "convert", label: "Units", icon: ArrowRightLeft },
  { id: "dextrose", label: "Dextrose", icon: Droplets },
  { id: "potassium", label: "Potassium", icon: Syringe },
  { id: "sodium", label: "Sodium", icon: GlassWater },
  { id: "osmolality", label: "Osmolality", icon: Gauge }
];

const unitConversions = {
  weight: [
    { from: "kg", to: "lb", factor: 2.20462 },
    { from: "lb", to: "kg", factor: 0.453592 },
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

export default function AdditionalClinicalCalculators({ darkMode = false }) {
  const resultRef = useRef(null);
  const [active, setActive] = useState("energy");
  const activeCalculator = calculators.find((item) => item.id === active) || calculators[0];
  const ActiveIcon = activeCalculator.icon;

  const selectCalculator = (id) => {
    setActive(id);
    window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
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
        {calculators.map((item) => (
          <AdditionalCalculatorTile
            key={item.id}
            icon={item.icon}
            title={item.label}
            active={active === item.id}
            darkMode={darkMode}
            onClick={() => selectCalculator(item.id)}
          />
        ))}
      </ToolTileGrid>

      <div ref={resultRef} className={`scroll-mt-24 rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
        <div className="flex items-center gap-2 mb-4">
          <ActiveIcon size={18} className="text-[#0F8F83]" />
          <h3 className="font-black">{activeCalculator.label}</h3>
        </div>
        {active === "energy" && <EnergyCalculator darkMode={darkMode} />}
        {active === "convert" && <UnitConversion darkMode={darkMode} />}
        {active === "dextrose" && <DextroseCalculator darkMode={darkMode} />}
        {active === "potassium" && <PotassiumCalculator darkMode={darkMode} />}
        {active === "sodium" && <SodiumCalculator darkMode={darkMode} />}
        {active === "osmolality" && <OsmolalityCalculator darkMode={darkMode} />}
      </div>
    </section>
  );
}

function AdditionalCalculatorTile({ icon: Icon, title, active, darkMode, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[96px] rounded-lg border border-transparent p-3 flex flex-col items-center justify-center gap-2 text-center font-black transition ${
        active
          ? "bg-[#71CFC2] text-[#062F63] shadow-sm"
          : darkMode
            ? "bg-white/10 text-slate-100 hover:bg-white/15"
            : "bg-[#E8F8F5] text-[#0B3760] hover:bg-[#DFF4F1]"
      }`}
    >
      {Icon && <Icon size={22} />}
      <span className="text-sm leading-tight">{title}</span>
    </button>
  );
}

function EnergyCalculator({ darkMode }) {
  const [weight, setWeight] = useState("");
  const [factor, setFactor] = useState("1.2");
  const kg = toNumber(weight);
  const rer = kg > 0 ? 70 * Math.pow(kg, 0.75) : 0;
  const mer = rer * toNumber(factor, 1);

  return (
    <div className="space-y-3">
      <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Body weight kg" value={weight} onChange={(event) => setWeight(event.target.value)} />
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
  const [weight, setWeight] = useState("");
  const [rate, setRate] = useState("0.25");
  const [hours, setHours] = useState("6");
  const [stock, setStock] = useState("2");
  const totalMEq = toNumber(weight) * toNumber(rate) * toNumber(hours);
  const mlToAdd = totalMEq / Math.max(toNumber(stock), 0.01);
  const highRate = toNumber(rate) > 0.5;

  return (
    <div className="space-y-3">
      <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Body weight kg" value={weight} onChange={(event) => setWeight(event.target.value)} />
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
  const [weight, setWeight] = useState("");
  const [currentNa, setCurrentNa] = useState("");
  const [targetNa, setTargetNa] = useState("");
  const [factor, setFactor] = useState("0.6");
  const change = Math.abs(toNumber(targetNa) - toNumber(currentNa));
  const deficit = toNumber(factor) * toNumber(weight) * (toNumber(targetNa) - toNumber(currentNa));
  const minHours = change / 0.5;

  return (
    <div className="space-y-3">
      <input className={fieldClass(darkMode)} type="number" inputMode="decimal" placeholder="Body weight kg" value={weight} onChange={(event) => setWeight(event.target.value)} />
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
