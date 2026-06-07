import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell, Briefcase, FileText, Globe, GraduationCap, Image as ImageIcon, KeyRound, Loader2, Lock, Mail, MapPin, Phone, Save, Shield, Sparkles, Target, Trash2, Upload, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import PageBanner from "../components/PageBanner";
import LoadingState from "../components/LoadingState";
import SettingsLegalDocuments from "../components/SettingsLegalDocuments";
import { supabase } from "../supabaseClient";
import { getUserAiApiKey, isAiApiKeyStoredSecurely, removeUserAiApiKey, saveUserAiApiKey } from "../utils/aiApiKeyStorage";
import { disableBiometric, isBiometricAvailable, isBiometricEnabled, registerBiometric } from "../utils/biometricAuth";

const DEFAULT_CPD_TARGET_HOURS = 35;

const profileDefaults = {
  avatar_url: "",
  full_name: "",
  title: "",
  practice_name: "",
  location: "",
  email: "",
  phone: "",
  mobile: "",
  website: "",
  bio: "",
  home_address: "",
  work_address: "",
  qualifications: "",
  degrees: "",
  certifications: "",
  rcvs_number: "",
  areas_of_interest: "",
  memberships: ""
};

const aiDefaults = {
  enabled: false,
  responseStyle: "Clear and practical",
  assistantPreference: "Concise clinical support",
  defaultTools: "CPD reflections, protocol drafting, clinical summaries",
  clinicalAssistance: true,
  cpdAssistance: true,
  learningRecommendations: true
};

const maxAvatarSize = 2 * 1024 * 1024;

export default function Settings({ user, darkMode = false, setDarkMode }) {
  const location = useLocation();
  const cpdTargetRef = useRef(null);
  const [activeTab, setActiveTab] = useState("profile");
  const [profileForm, setProfileForm] = useState(profileDefaults);
  const [aiPrefs, setAiPrefs] = useState(aiDefaults);
  const [appPrefs, setAppPrefs] = useState({ notifications: true, privacyMode: false, biometricUnlock: false, theme: darkMode ? "dark" : "light", cpdTargetHours: DEFAULT_CPD_TARGET_HOURS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [aiApiKeyInput, setAiApiKeyInput] = useState("");
  const [aiApiKeySaved, setAiApiKeySaved] = useState(false);
  const [aiApiKeyBusy, setAiApiKeyBusy] = useState(false);
  const [aiApiPromptOpen, setAiApiPromptOpen] = useState(false);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";
  const fieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247]"}`;

  useEffect(() => {
    if (user) loadSettings();
  }, [user]);

  useEffect(() => {
    setAppPrefs(prev => ({ ...prev, theme: darkMode ? "dark" : "light" }));
  }, [darkMode]);

  useEffect(() => {
    if (location.hash === "#cpd-target" || location.state?.scrollTo === "cpd-target") {
      setActiveTab("app");
      window.setTimeout(() => {
        cpdTargetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        cpdTargetRef.current?.querySelector("input")?.focus();
      }, 150);
    }
  }, [location.hash, location.state]);

  const loadSettings = async () => {
    setLoading(true);
    const [profileRes, prefsRes, biometricSupport] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      isBiometricAvailable()
    ]);

    if (!profileRes.error && profileRes.data) {
      setProfileForm({
        ...profileDefaults,
        email: user.email || "",
        ...Object.fromEntries(Object.keys(profileDefaults).map(key => [key, profileRes.data[key] || ""]))
      });
    } else {
      setProfileForm(prev => ({ ...prev, email: user.email || "" }));
    }

    const savedAiKey = await getUserAiApiKey(user.id);
    setAiApiKeySaved(Boolean(savedAiKey));

    if (!prefsRes.error && prefsRes.data) {
      const nextAiPrefs = { ...aiDefaults, ...(prefsRes.data.ai_preferences || {}) };
      nextAiPrefs.enabled = nextAiPrefs.enabled && Boolean(savedAiKey);
      setAiPrefs(nextAiPrefs);
      localStorage.setItem("vetlearn-ai-enabled", String(nextAiPrefs.enabled));
      setAppPrefs({ notifications: true, privacyMode: false, biometricUnlock: false, theme: darkMode ? "dark" : "light", cpdTargetHours: DEFAULT_CPD_TARGET_HOURS, ...(prefsRes.data.app_preferences || {}) });
    }

    setBiometricAvailable(biometricSupport);
    setBiometricEnabled(isBiometricEnabled(user.id));
    setLoading(false);
  };

  const updateProfile = (field, value) => setProfileForm(prev => ({ ...prev, [field]: value }));
  const updateAi = (field, value) => setAiPrefs(prev => ({ ...prev, [field]: value }));
  const updateApp = (field, value) => setAppPrefs(prev => ({ ...prev, [field]: value }));

  const persistPreferences = async (nextAiPrefs = aiPrefs, nextAppPrefs = appPrefs) => {
    const { error } = await supabase.from("user_preferences").upsert({
      user_id: user.id,
      ai_preferences: nextAiPrefs,
      app_preferences: nextAppPrefs,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });

    if (!error) {
      localStorage.setItem("vetlearn-ai-enabled", String(nextAiPrefs.enabled));
      window.dispatchEvent(new Event("settingsUpdated"));
    }

    return { error };
  };

  const persistAppPreferences = async (nextAppPrefs) => {
    await persistPreferences(aiPrefs, nextAppPrefs);
  };

  const updateAiEnabled = async (enabled) => {
    if (enabled && !aiApiKeySaved) {
      setAiApiPromptOpen(true);
      return;
    }

    const nextPrefs = { ...aiPrefs, enabled };
    setAiPrefs(nextPrefs);
    const { error } = await persistPreferences(nextPrefs, appPrefs);
    if (error) return toast.error("Could not update AI settings");
    toast.success(enabled ? "AI features enabled" : "AI features disabled");
  };

  const saveAiApiKey = async ({ enableAfterSave = false } = {}) => {
    setAiApiKeyBusy(true);
    try {
      const result = await saveUserAiApiKey(user.id, aiApiKeyInput);
      setAiApiKeySaved(true);
      setAiApiKeyInput("");
      setAiApiPromptOpen(false);

      if (enableAfterSave) {
        const nextPrefs = { ...aiPrefs, enabled: true };
        setAiPrefs(nextPrefs);
        const { error } = await persistPreferences(nextPrefs, appPrefs);
        if (error) throw error;
      }

      toast.success(result.secure ? "AI API key saved securely" : "AI API key saved on this device");
    } catch (error) {
      toast.error(error.message || "Could not save AI API key");
    } finally {
      setAiApiKeyBusy(false);
    }
  };

  const removeAiApiKey = async () => {
    setAiApiKeyBusy(true);
    await removeUserAiApiKey(user.id);
    setAiApiKeySaved(false);
    setAiApiKeyInput("");
    const nextPrefs = { ...aiPrefs, enabled: false };
    setAiPrefs(nextPrefs);
    const { error } = await persistPreferences(nextPrefs, appPrefs);
    setAiApiKeyBusy(false);
    if (error) return toast.error("Could not update AI settings");
    toast.success("AI API key removed");
  };

  const toggleBiometricUnlock = async (enabled) => {
    if (enabled && !biometricAvailable) {
      toast.error("Fingerprint or Face ID is not available on this device/browser");
      return;
    }

    setBiometricBusy(true);
    try {
      if (enabled) {
        await registerBiometric(user);
        setBiometricEnabled(true);
        const nextPrefs = { ...appPrefs, biometricUnlock: true };
        setAppPrefs(nextPrefs);
        await persistAppPreferences(nextPrefs);
        window.dispatchEvent(new Event("biometricSettingsUpdated"));
        toast.success("Fingerprint login enabled on this device");
      } else {
        await disableBiometric(user.id);
        setBiometricEnabled(false);
        const nextPrefs = { ...appPrefs, biometricUnlock: false };
        setAppPrefs(nextPrefs);
        await persistAppPreferences(nextPrefs);
        window.dispatchEvent(new Event("biometricSettingsUpdated"));
        toast.success("Fingerprint login disabled");
      }
    } catch (error) {
      toast.error(error.message || "Could not update fingerprint login");
    } finally {
      setBiometricBusy(false);
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }

    if (file.size > maxAvatarSize) {
      toast.error("Image must be under 2 MB");
      return;
    }

    setUploadingAvatar(true);
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExtension = ["jpg", "jpeg", "png", "webp", "gif"].includes(extension) ? extension : "jpg";
    const filePath = `${user.id}/avatar.${safeExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-images")
      .upload(filePath, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      setUploadingAvatar(false);
      toast.error(uploadError.message || "Could not upload image. Please run the Supabase storage SQL.");
      return;
    }

    const { data } = supabase.storage.from("profile-images").getPublicUrl(filePath);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString()
    });

    if (profileError) toast.error("Avatar uploaded but profile could not be updated");
    else {
      updateProfile("avatar_url", avatarUrl);
      window.dispatchEvent(new Event("profileUpdated"));
      toast.success("Profile image updated");
    }
    setUploadingAvatar(false);
  };

  const saveProfile = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({ id: user.id, ...profileForm, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return toast.error("Could not save profile");
    window.dispatchEvent(new Event("profileUpdated"));
    toast.success("Profile saved");
  };

  const savePreferences = async () => {
    setSaving(true);
    const { error } = await persistPreferences();
    setSaving(false);
    if (error) return toast.error("Could not save preferences");
    toast.success("Preferences saved");
  };

  const tabs = [
    { id: "profile", label: "Profile", icon: UserRound },
    { id: "professional", label: "Professional", icon: Briefcase },
    { id: "ai", label: "AI", icon: Sparkles },
    { id: "app", label: "App", icon: Lock },
    { id: "docs", label: "Privacy", icon: FileText }
  ];

  if (loading) {
    return <LoadingState label="Loading settings..." darkMode={darkMode} />;
  }

  return (
    <div className="pb-8">
      <PageBanner title="Settings" subtitle="Manage your profile, preferences and documents." darkMode={darkMode} />
      <div className="flex overflow-x-auto gap-2 mb-6 pb-2 scrollbar-hide">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm flex items-center gap-2 ${activeTab === tab.id ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
      </div>

      {aiApiPromptOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 px-4 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${darkMode ? "bg-[#071A24] border-white/10 text-white" : "bg-white border-[#DCEDEA] text-[#113247]"}`}>
            <h3 className="text-xl font-black mb-2">Add your OpenAI API key</h3>
            <p className="text-sm opacity-70 leading-6 mb-4">AI features use your own key. It is saved securely where supported, with local encrypted fallback on this device.</p>
            <input className={fieldClass} type="password" placeholder="OpenAI API key" value={aiApiKeyInput} onChange={(e) => setAiApiKeyInput(e.target.value)} />
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => setAiApiPromptOpen(false)} disabled={aiApiKeyBusy} className={`rounded-lg p-3 font-black ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>Cancel</button>
              <button onClick={() => saveAiApiKey({ enableAfterSave: true })} disabled={aiApiKeyBusy || !aiApiKeyInput.trim()} className="rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black disabled:opacity-50">
                {aiApiKeyBusy ? "Saving..." : "Save & enable"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {activeTab === "profile" && (
          <section className={panelClass}>
            <SectionTitle icon={<UserRound size={20} />} title="Profile" subtitle="Your professional identity across VetLearn." darkMode={darkMode} />
            <div className="flex items-center gap-4 mb-5">
              <div className="h-20 w-20 rounded-2xl bg-[#71CFC2] text-[#062F63] grid place-items-center overflow-hidden text-2xl font-black shrink-0">
                {profileForm.avatar_url ? <img src={profileForm.avatar_url} alt="Profile" className="h-full w-full object-cover" /> : (profileForm.full_name || user.email || "V").charAt(0).toUpperCase()}
              </div>
              <label className={`rounded-lg px-4 py-3 text-sm font-black flex items-center gap-2 cursor-pointer ${darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
                {uploadingAvatar ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Upload profile image
                <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} disabled={uploadingAvatar} />
              </label>
            </div>
            <div className="space-y-3">
              <InputWithIcon icon={<UserRound size={17} />}><input className={`${fieldClass} pl-10`} placeholder="Full name" value={profileForm.full_name} onChange={(e) => updateProfile("full_name", e.target.value)} /></InputWithIcon>
              <InputWithIcon icon={<Briefcase size={17} />}><input className={`${fieldClass} pl-10`} placeholder="Title / role" value={profileForm.title} onChange={(e) => updateProfile("title", e.target.value)} /></InputWithIcon>
              <InputWithIcon icon={<Briefcase size={17} />}><input className={`${fieldClass} pl-10`} placeholder="Practice name" value={profileForm.practice_name} onChange={(e) => updateProfile("practice_name", e.target.value)} /></InputWithIcon>
              <InputWithIcon icon={<MapPin size={17} />}><input className={`${fieldClass} pl-10`} placeholder="Location" value={profileForm.location} onChange={(e) => updateProfile("location", e.target.value)} /></InputWithIcon>
              <InputWithIcon icon={<Mail size={17} />}><input className={`${fieldClass} pl-10`} placeholder="Email" value={profileForm.email} onChange={(e) => updateProfile("email", e.target.value)} /></InputWithIcon>
              <InputWithIcon icon={<Phone size={17} />}><input className={`${fieldClass} pl-10`} placeholder="Phone" value={profileForm.phone} onChange={(e) => updateProfile("phone", e.target.value)} /></InputWithIcon>
              <InputWithIcon icon={<Phone size={17} />}><input className={`${fieldClass} pl-10`} placeholder="Mobile" value={profileForm.mobile} onChange={(e) => updateProfile("mobile", e.target.value)} /></InputWithIcon>
              <InputWithIcon icon={<Globe size={17} />}><input className={`${fieldClass} pl-10`} placeholder="Website" value={profileForm.website} onChange={(e) => updateProfile("website", e.target.value)} /></InputWithIcon>
              <textarea className={fieldClass} rows="4" placeholder="Bio" value={profileForm.bio} onChange={(e) => updateProfile("bio", e.target.value)} />
            </div>
            <SaveButton saving={saving} onClick={saveProfile} label="Save Profile" />
          </section>
        )}

        {activeTab === "professional" && (
          <section className={panelClass}>
            <SectionTitle icon={<GraduationCap size={20} />} title="Professional Information" subtitle="Credentials, addresses and interests for colleague sharing." darkMode={darkMode} />
            <div className="space-y-3">
              <textarea className={fieldClass} rows="3" placeholder="Qualifications" value={profileForm.qualifications} onChange={(e) => updateProfile("qualifications", e.target.value)} />
              <textarea className={fieldClass} rows="3" placeholder="Degrees" value={profileForm.degrees} onChange={(e) => updateProfile("degrees", e.target.value)} />
              <textarea className={fieldClass} rows="3" placeholder="Certifications" value={profileForm.certifications} onChange={(e) => updateProfile("certifications", e.target.value)} />
              <textarea className={fieldClass} rows="3" placeholder="Home address" value={profileForm.home_address} onChange={(e) => updateProfile("home_address", e.target.value)} />
              <textarea className={fieldClass} rows="3" placeholder="Work address" value={profileForm.work_address} onChange={(e) => updateProfile("work_address", e.target.value)} />
              <input className={fieldClass} placeholder="RCVS number / information" value={profileForm.rcvs_number} onChange={(e) => updateProfile("rcvs_number", e.target.value)} />
              <textarea className={fieldClass} rows="3" placeholder="Areas of interest" value={profileForm.areas_of_interest} onChange={(e) => updateProfile("areas_of_interest", e.target.value)} />
              <textarea className={fieldClass} rows="3" placeholder="Professional memberships" value={profileForm.memberships} onChange={(e) => updateProfile("memberships", e.target.value)} />
            </div>
            <SaveButton saving={saving} onClick={saveProfile} label="Save Professional Information" />
          </section>
        )}

        {activeTab === "ai" && (
          <section className={panelClass}>
            <SectionTitle icon={<Sparkles size={20} />} title="AI Preferences" subtitle="Control how VetLearn assists with learning, CPD and clinical support." darkMode={darkMode} />
            <Toggle checked={aiPrefs.enabled} onChange={updateAiEnabled} label="Enable AI features" darkMode={darkMode} />
            <div className={`mb-4 rounded-lg p-4 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-sm">OpenAI API key</p>
                  <p className="text-xs opacity-60 mt-1 leading-5">
                    {aiApiKeySaved ? "An API key is saved for AI features." : "Add your own API key before turning AI on."}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${aiApiKeySaved ? "bg-[#E8F8F5] text-[#0F8F83]" : "bg-orange-100 text-orange-700"}`}>
                  {aiApiKeySaved ? "Saved" : "Required"}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  className={fieldClass}
                  type="password"
                  placeholder={aiApiKeySaved ? "Enter a new key to replace it" : "OpenAI API key"}
                  value={aiApiKeyInput}
                  onChange={(e) => setAiApiKeyInput(e.target.value)}
                />
                <button
                  onClick={() => saveAiApiKey()}
                  disabled={aiApiKeyBusy || !aiApiKeyInput.trim()}
                  className="rounded-lg bg-[#71CFC2] text-[#062F63] px-4 py-3 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {aiApiKeyBusy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                  Save key
                </button>
              </div>
              {aiApiKeySaved && (
                <button
                  onClick={removeAiApiKey}
                  disabled={aiApiKeyBusy}
                  className={`mt-2 rounded-lg px-3 py-2 text-xs font-black flex items-center gap-2 ${darkMode ? "bg-transparent text-slate-200 hover:bg-red-500/10" : "bg-transparent text-[#0B3760] hover:bg-red-50"}`}
                  aria-label="Remove"
                >
                  <Trash2 size={14} className="text-red-500" />
                  Remove key and disable AI
                </button>
              )}
            </div>
            <input className={fieldClass} placeholder="AI response style" value={aiPrefs.responseStyle} onChange={(e) => updateAi("responseStyle", e.target.value)} />
            <input className={fieldClass} placeholder="Assistant preferences" value={aiPrefs.assistantPreference} onChange={(e) => updateAi("assistantPreference", e.target.value)} />
            <textarea className={fieldClass} rows="3" placeholder="Default AI tools" value={aiPrefs.defaultTools} onChange={(e) => updateAi("defaultTools", e.target.value)} />
            <Toggle checked={aiPrefs.clinicalAssistance} onChange={(value) => updateAi("clinicalAssistance", value)} label="Clinical assistance" darkMode={darkMode} />
            <Toggle checked={aiPrefs.cpdAssistance} onChange={(value) => updateAi("cpdAssistance", value)} label="CPD assistance" darkMode={darkMode} />
            <Toggle checked={aiPrefs.learningRecommendations} onChange={(value) => updateAi("learningRecommendations", value)} label="Learning recommendations" darkMode={darkMode} />
            <SaveButton saving={saving} onClick={savePreferences} label="Save AI Preferences" />
          </section>
        )}

        {activeTab === "app" && (
          <section className={panelClass}>
            <SectionTitle icon={<Lock size={20} />} title="Application Settings" subtitle="Theme, notifications, privacy and account management." darkMode={darkMode} />
            <Toggle checked={darkMode} onChange={(value) => { setDarkMode?.(value); updateApp("theme", value ? "dark" : "light"); }} label="Dark mode" darkMode={darkMode} />
            <Toggle checked={appPrefs.notifications} onChange={(value) => updateApp("notifications", value)} label="Notifications" darkMode={darkMode} />
            <div id="cpd-target" ref={cpdTargetRef} className={`scroll-mt-28 mb-4 rounded-lg p-4 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}>
              <div className="flex items-start gap-3 mb-3">
                <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-white text-[#0F8F83]"} h-10 w-10 rounded-lg grid place-items-center shrink-0`}>
                  <Target size={18} />
                </div>
                <div>
                  <label className="font-black text-sm" htmlFor="cpd-target-hours">CPD target hours</label>
                  <p className="text-xs opacity-60 leading-5">Shown on your CPD dashboard and used for annual progress.</p>
                </div>
              </div>
              <input
                id="cpd-target-hours"
                className={fieldClass}
                type="number"
                min="0.25"
                max="1000"
                step="0.25"
                value={appPrefs.cpdTargetHours ?? DEFAULT_CPD_TARGET_HOURS}
                onChange={(event) => updateApp("cpdTargetHours", event.target.value)}
              />
            </div>
            <Toggle
              checked={biometricEnabled}
              onChange={toggleBiometricUnlock}
              label={biometricAvailable ? "Fingerprint / Face login on this device" : "Fingerprint / Face login unavailable"}
              darkMode={darkMode}
              disabled={!biometricAvailable || biometricBusy}
            />
            <p className="text-xs opacity-60 -mt-2 mb-4 leading-5">
              Uses this phone or browser's built-in biometric/passkey prompt when available. Turn it on once while signed in, then the login screen will show the fingerprint button on this device.
            </p>
            <Toggle checked={appPrefs.privacyMode} onChange={(value) => updateApp("privacyMode", value)} label="Privacy mode" darkMode={darkMode} />
            <p className="text-xs opacity-60 -mt-2 mb-4 leading-5">
              Hides your profile from Network search results, so new colleagues cannot find you by searching your name. Existing colleagues, requests and messages are unchanged.
            </p>
            <div className={`${darkMode ? "bg-black/20" : "bg-[#F0F6F5]"} rounded-lg p-4 text-sm opacity-80`}>Security and account deletion controls can be connected to Supabase Auth when you are ready.</div>
            <SaveButton saving={saving} onClick={savePreferences} label="Save Application Settings" />
          </section>
        )}

        {activeTab === "docs" && <SettingsLegalDocuments darkMode={darkMode} />}
      </div>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle, darkMode }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3`}>{icon}</div>
      <div><h2 className="font-black text-lg">{title}</h2><p className="text-sm opacity-60">{subtitle}</p></div>
    </div>
  );
}

function InputWithIcon({ icon, children }) {
  return <div className="relative"><div className="absolute left-3 top-3.5 opacity-50">{icon}</div>{children}</div>;
}

function Toggle({ checked, onChange, label, darkMode, disabled = false }) {
  return (
    <label className={`flex items-center gap-3 mb-4 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={`relative block w-14 h-8 rounded-full transition-colors ${checked ? "bg-[#71CFC2]" : darkMode ? "bg-slate-600" : "bg-slate-300"}`}>
        <span className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${checked ? "translate-x-6" : ""}`} />
      </span>
      <span className="font-bold text-sm">{label}</span>
    </label>
  );
}

function SaveButton({ saving, onClick, label }) {
  return (
    <button onClick={onClick} disabled={saving} className="w-full mt-5 bg-[#0B3760] text-white rounded-lg p-4 flex justify-center items-center gap-2 font-bold shadow-[0_12px_24px_rgba(11,55,96,0.16)] disabled:opacity-60">
      {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
      {label}
    </button>
  );
}
