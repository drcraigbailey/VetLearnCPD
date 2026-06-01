import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import {
  UserCircle, Loader2, Save, Trash2, ExternalLink,
  Eye, EyeOff, Lock, User, Building2, GraduationCap, MapPin
} from "lucide-react";
import HeartbeatLoader from "../components/HeartbeatLoader";

export default function Profile({ user, darkMode = false }) {
  // --- Profile Details State ---
  const [profileForm, setProfileForm] = useState({
    title: "",
    full_name: "",
    qualifications: "",
    rcvs_number: "",
    home_address: "",
    work_address: ""
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // --- Credentials Vault State ---
  const [credentials, setCredentials] = useState([]);
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [savingCred, setSavingCred] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [credForm, setCredForm] = useState({
    provider_name: "",
    registration_number: "",
    password_note: "",
    login_url: ""
  });

  const fieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${
    darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247]"
  }`;

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";

  useEffect(() => {
    if (user) {
      loadProfileDetails();
      loadCredentials();
    }
  }, [user]);

  // --- Profile Details Logic ---
  const loadProfileDetails = async () => {
    setLoadingProfile(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!error && data) {
      setProfileForm({
        title: data.title || "",
        full_name: data.full_name || "",
        qualifications: data.qualifications || "",
        rcvs_number: data.rcvs_number || "",
        home_address: data.home_address || "",
        work_address: data.work_address || ""
      });
    }
    setLoadingProfile(false);
  };

  const updateProfileForm = (field, value) => {
    setProfileForm({ ...profileForm, [field]: value });
  };

  const saveProfileDetails = async () => {
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        title: profileForm.title.trim(),
        full_name: profileForm.full_name.trim(),
        qualifications: profileForm.qualifications.trim(),
        rcvs_number: profileForm.rcvs_number.trim(),
        home_address: profileForm.home_address.trim(),
        work_address: profileForm.work_address.trim()
      })
      .eq("id", user.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile details saved");
    }
    setSavingProfile(false);
  };

  // --- Credentials Vault Logic ---
  const loadCredentials = async () => {
    setLoadingCreds(true);
    const { data, error } = await supabase
      .from("professional_credentials")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) toast.error(error.message);
    else setCredentials(data || []);
    setLoadingCreds(false);
  };

  const updateCredForm = (field, value) => {
    setCredForm({ ...credForm, [field]: value });
  };

  const togglePasswordVisibility = (id) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const addCredential = async () => {
    if (!credForm.provider_name.trim()) {
      toast.error("Add a provider name (e.g., VDS, BVA)");
      return;
    }

    setSavingCred(true);
    const { error } = await supabase.from("professional_credentials").insert({
      user_id: user.id,
      provider_name: credForm.provider_name.trim(),
      registration_number: credForm.registration_number.trim() || null,
      password_note: credForm.password_note.trim() || null,
      login_url: credForm.login_url.trim() || null
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Credential securely saved");
      setCredForm({ provider_name: "", registration_number: "", password_note: "", login_url: "" });
      loadCredentials();
    }
    setSavingCred(false);
  };

  const deleteCredential = async (id) => {
    setBusyId(id);
    const { error } = await supabase
      .from("professional_credentials")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
      
    if (error) {
      toast.error(error.message);
    } else {
      setCredentials(credentials.filter(cred => cred.id !== id));
      toast.success("Removed");
    }
    setBusyId(null);
  };

  return (
    <div>
      {/* Header */}
      <div className={`relative overflow-hidden bg-gradient-to-br border rounded-lg p-6 mb-6 shadow-[0_18px_45px_rgba(11,55,96,0.08)] ${darkMode ? "from-[#12323A] to-[#0B242B] border-white/10" : "from-white to-[#DFF7F3] border-[#CDEBE7]"}`}>
        <img src="/logo.png" alt="" aria-hidden="true" className="absolute -right-8 -bottom-12 w-44 h-44 object-contain opacity-[0.10] pointer-events-none" />
        <div className="relative">
          <h1 className={`text-3xl font-black leading-tight tracking-normal mb-2 ${darkMode ? "text-white" : "text-[#113247]"}`}>
            My Profile
          </h1>
          <p className={`text-sm leading-6 max-w-[260px] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
            Manage your professional details, contact information, and secure credential vault.
          </p>
        </div>
      </div>

      {/* SECTION 1: Professional Details */}
      <div className={`${panelClass} mb-6`}>
        <div className="flex items-start gap-3 mb-5">
          <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3`}>
            <User size={20} />
          </div>
          <div>
            <h2 className={`font-black text-lg ${darkMode ? "text-white" : "text-[#113247]"}`}>Professional Details</h2>
            <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-500"}`}>Your core information for CPD and reports.</p>
          </div>
        </div>

        {loadingProfile ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <HeartbeatLoader size={48} />
            <p className="font-bold opacity-70 text-xs tracking-widest uppercase text-[#71CFC2]">Loading Profile...</p>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in">
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <input className={fieldClass} placeholder="Title" value={profileForm.title} onChange={(e) => updateProfileForm("title", e.target.value)} />
              <input className={fieldClass} placeholder="Full Name" value={profileForm.full_name} onChange={(e) => updateProfileForm("full_name", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <GraduationCap size={16} className={`absolute left-3 top-3.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`} />
                <input className={`${fieldClass} pl-10`} placeholder="Qualifications (e.g. BVSc)" value={profileForm.qualifications} onChange={(e) => updateProfileForm("qualifications", e.target.value)} />
              </div>
              <div className="relative">
                <UserCircle size={16} className={`absolute left-3 top-3.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`} />
                <input className={`${fieldClass} pl-10`} placeholder="RCVS Number" value={profileForm.rcvs_number} onChange={(e) => updateProfileForm("rcvs_number", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <MapPin size={16} className={`absolute left-3 top-3.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`} />
                <textarea rows="3" className={`${fieldClass} pl-10`} placeholder="Home Address" value={profileForm.home_address} onChange={(e) => updateProfileForm("home_address", e.target.value)} />
              </div>
              <div className="relative">
                <Building2 size={16} className={`absolute left-3 top-3.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`} />
                <textarea rows="3" className={`${fieldClass} pl-10`} placeholder="Work / Practice Address" value={profileForm.work_address} onChange={(e) => updateProfileForm("work_address", e.target.value)} />
              </div>
            </div>

            <button 
              className={`w-full bg-[#E8F8F5] text-[#0F8F83] dark:bg-white/10 dark:text-[#71CFC2] hover:opacity-80 transition rounded-lg p-3 font-bold flex justify-center items-center gap-2`}
              onClick={saveProfileDetails} 
              disabled={savingProfile}
            >
              {savingProfile ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Save size={18} /> Update Profile</>}
            </button>
          </div>
        )}
      </div>

      <hr className={`my-8 border-t ${darkMode ? "border-white/10" : "border-slate-200"}`} />

      {/* SECTION 2: Credential Vault */}
      <div className={`${panelClass} mb-6`}>
        <div className="flex items-start gap-3 mb-5">
          <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3`}>
            <Lock size={20} />
          </div>
          <div>
            <h2 className={`font-black text-lg ${darkMode ? "text-white" : "text-[#113247]"}`}>Credential Vault</h2>
            <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-500"}`}>Store external registrations or portal logins.</p>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          <input className={fieldClass} placeholder="Provider Name (e.g. VDS, BVA, RCVS Portal)" value={credForm.provider_name} onChange={(e) => updateCredForm("provider_name", e.target.value)} />
          <input className={fieldClass} placeholder="Registration / Account Number" value={credForm.registration_number} onChange={(e) => updateCredForm("registration_number", e.target.value)} />
          <input className={fieldClass} placeholder="Password / PIN / Secure Note" type="password" value={credForm.password_note} onChange={(e) => updateCredForm("password_note", e.target.value)} />
          <input className={fieldClass} placeholder="Login URL (e.g. https://portal.example.com)" type="url" value={credForm.login_url} onChange={(e) => updateCredForm("login_url", e.target.value)} />
        </div>

        <button className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-4 font-black shadow-[0_12px_24px_rgba(15,143,131,0.16)] disabled:opacity-50 flex justify-center items-center gap-2" onClick={addCredential} disabled={savingCred}>
          {savingCred ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Lock size={18} /> Save to Vault</>}
        </button>
      </div>

      <div className="space-y-4">
        {loadingCreds && (
          <div className={`${panelClass} flex flex-col items-center justify-center py-8 gap-4`}>
            <HeartbeatLoader size={48} />
            <p className="font-bold opacity-70 text-xs tracking-widest uppercase text-[#71CFC2]">Loading Vault...</p>
          </div>
        )}
        
        {!loadingCreds && credentials.length === 0 && <div className={`${panelClass} text-sm text-slate-500`}>No credentials saved yet.</div>}

        {!loadingCreds && credentials.map((cred) => {
          const isVisible = visiblePasswords[cred.id] || false;
          
          return (
            <div key={cred.id} className={`${panelClass} animate-in fade-in`}>
              <div className="flex justify-between items-center gap-3 mb-3 border-b pb-3 border-slate-200 dark:border-white/10">
                <h3 className={`font-black text-lg ${darkMode ? "text-white" : "text-[#113247]"}`}>{cred.provider_name}</h3>
                <button onClick={() => deleteCredential(cred.id)} className={`h-8 w-8 grid place-items-center rounded-md ${darkMode ? "text-slate-400 hover:bg-white/10" : "text-slate-400 hover:bg-slate-100"}`}>
                  {busyId === cred.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </div>
              
              <div className="space-y-3">
                {cred.registration_number && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Reg / Account Number</div>
                    <div className={`font-mono text-sm mt-0.5 ${darkMode ? "text-slate-200" : "text-slate-700"}`}>{cred.registration_number}</div>
                  </div>
                )}
                
                {cred.password_note && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Password / Note</div>
                    <div className="flex items-center gap-2">
                      <div className={`font-mono text-sm px-3 py-2 rounded bg-black/5 dark:bg-white/5 flex-grow ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                        {isVisible ? cred.password_note : "••••••••••••••••"}
                      </div>
                      <button 
                        onClick={() => togglePasswordVisibility(cred.id)}
                        className={`p-2 rounded transition ${darkMode ? "bg-white/5 text-slate-300 hover:text-white" : "bg-slate-100 text-slate-500 hover:text-black"}`}
                      >
                        {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                {cred.login_url && (
                  <div className="pt-2">
                    <a href={cred.login_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-[#0F8F83] bg-[#E8F8F5] dark:bg-white/10 dark:text-[#71CFC2] rounded-lg px-3 py-2 transition hover:opacity-80">
                      <ExternalLink size={14} /> Open Portal
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}