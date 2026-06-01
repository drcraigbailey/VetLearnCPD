import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import HeartbeatLoader from '../components/HeartbeatLoader';
import { ArrowLeft, BookOpen, AlertTriangle, Ban, RefreshCw, TestTubes, PawPrint, Activity, Baby } from 'lucide-react';

export default function DrugPage({ user, darkMode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [drug, setDrug] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDrugData = async () => {
      setLoading(true);
      // Fetch core drug info
      const { data, error } = await supabase
        .from('drugs')
        .select(`*, drug_information(*), contraindications(*), species_warnings(*), drug_interactions(*)`)
        .eq('id', id)
        .single();
      
      if (error) {
        console.error("Error loading drug:", error);
      } else {
        setDrug(data);
      }
      setLoading(false);
    };
    fetchDrugData();
  }, [id]);

  if (loading) return <div className="grid place-items-center min-h-[50vh]"><HeartbeatLoader size={60} /></div>;
  if (!drug) return <div className="p-8 text-center">Drug not found.</div>;

  return (
    <div className={`max-w-2xl mx-auto p-4 ${darkMode ? "text-slate-100" : "text-[#113247]"}`}>
      <button onClick={() => navigate(-1)} className="mb-6 flex items-center gap-2 text-sm font-bold opacity-60 hover:opacity-100">
        <ArrowLeft size={16} /> Back to Library
      </button>

      {/* Header */}
      <header className="mb-8">
        <h1 className="text-4xl font-black mb-2">{drug.name}</h1>
        <span className="px-3 py-1 rounded-full bg-[#71CFC2]/20 text-[#0F8F83] text-xs font-bold uppercase">{drug.category}</span>
      </header>

      {/* Structured Sections */}
      <div className="space-y-6">
        <Section title="Clinical Summary" icon={<BookOpen size={18}/>}>
          <p className="text-sm leading-relaxed">{drug.description || "No summary available."}</p>
        </Section>

        <Section title="Contraindications" icon={<Ban size={18}/>}>
          {drug.contraindications?.length > 0 ? (
            <ul className="list-disc pl-4 text-sm space-y-1">
              {drug.contraindications.map((c, i) => <li key={i}>{c.note}</li>)}
            </ul>
          ) : <p className="text-sm opacity-60">None listed.</p>}
        </Section>

        <Section title="Species Warnings" icon={<PawPrint size={18}/>}>
          {drug.species_warnings?.length > 0 ? (
             <div className="text-sm space-y-2">
               {drug.species_warnings.map((w, i) => <p key={i}><strong>{w.species}:</strong> {w.warning}</p>)}
             </div>
          ) : <p className="text-sm opacity-60">No specific warnings.</p>}
        </Section>

        <Section title="Interactions" icon={<RefreshCw size={18}/>}>
          {drug.drug_interactions?.length > 0 ? (
            <ul className="text-sm space-y-2">
              {drug.drug_interactions.map((int, i) => <li key={i}>{int.mechanism}</li>)}
            </ul>
          ) : <p className="text-sm opacity-60">No interactions recorded.</p>}
        </Section>
      </div>
    </div>
  );
}

// Helper Section Wrapper
function Section({ title, icon, children }) {
  return (
    <div className="border-b border-slate-200 dark:border-white/10 pb-6">
      <h2 className="flex items-center gap-2 font-black text-lg mb-3 opacity-90">{icon} {title}</h2>
      {children}
    </div>
  );
}