import { useEffect, useState } from "react";
import { Bell, Briefcase, Globe, GraduationCap, Image as ImageIcon, KeyRound, Loader2, Lock, Mail, MapPin, Phone, Save, Shield, Sparkles, Trash2, Upload, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import PageBanner from "../components/PageBanner";
import { supabase } from "../supabaseClient";
import { getUserAiApiKey, isAiApiKeyStoredSecurely, removeUserAiApiKey, saveUserAiApiKey } from "../utils/aiApiKeyStorage";
import { disableBiometric, isBiometricAvailable, isBiometricEnabled, registerBiometric } from "../utils/biometricAuth";

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
  const [activeTab, setActiveTab] = useState("profile");
  const [profileForm, setProfileForm] = useState(profileDefaults);
  const [aiPrefs, setAiPrefs] = useState(aiDefaults);
  const [appPrefs, setAppPrefs] = useState({ notifications: true, privacyMode: false, biometricUnlock: false, theme: darkMode ? "dark" : "light" });
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
      setAppPrefs({ notifications: true, privacyMode: false, biometricUnlock: false, theme: darkMode ? "dark" : "light", ...(prefsRes.data.app_preferences || {}) });
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
      email: profileForm.email || user.email,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });

    setUploadingAvatar(false);
    if (profileError) {
      toast.error("Image uploaded, but profile could not be updated");
      return;
    }

    updateProfile("avatar_url", avatarUrl);
    window.dispatchEvent(new Event("profileUpdated"));
    toast.success("Profile image uploaded");
  };

  const saveProfile = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      ...profileForm,
      email: profileForm.email || user.email,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });

    setSaving(false);
    if (error) return toast.error("Could not save profile. Please run the latest Supabase SQL update.");
    window.dispatchEvent(new Event("profileUpdated"));
    toast.success("Profile saved");
  };

  const savePreferences = async () => {
    setSaving(true);
    const { error } = await persistPreferences(aiPrefs, appPrefs);

    setSaving(false);
    if (error) return toast.error("Could not save preferences. Please run the latest Supabase SQL update.");
    toast.success("Preferences saved");
  };

  const tabs = [
    { id: "profile", label: "Profile", icon: UserRound },
    { id: "professional", label: "Professional", icon: GraduationCap },
    { id: "ai", label: "AI", icon: Sparkles },
    { id: "app", label: "App", icon: Shield }
  ];

  return (
    <div className="pb-8">
      <PageBanner title="Settings" subtitle="Manage your profile, professional details, AI preferences and account settings." darkMode={darkMode} />

      {aiApiPromptOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4">
          <div className={`w-full max-w-md rounded-lg border p-5 shadow-2xl ${darkMode ? "border-white/10 bg-[#071A24] text-white" : "border-[#DCEDEA] bg-white text-[#0B3760]"}`}>
            <div className="flex items-start gap-3">
              <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} h-10 w-10 rounded-lg grid place-items-center shrink-0`}>
                <KeyRound size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black">Add your OpenAI API key</h3>
                <p className="mt-1 text-sm opacity-70 leading-6">
                  AI features use your own API key. It is saved for your account on this device, then AI can be enabled.
                </p>
              </div>
            </div>
            <input
              className={fieldClass}
              type="password"
              placeholder="OpenAI API key"
              value={aiApiKeyInput}
              onChange={(event) => setAiApiKeyInput(event.target.value)}
              autoFocus
            />
            <p className="text-xs opacity-60 leading-5 -mt-1">
              {isAiApiKeyStoredSecurely() ? "This device supports secure credential storage." : "In this browser, the key is stored locally on this device."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => { setAiApiPromptOpen(false); setAiApiKeyInput(""); }} disabled={aiApiKeyBusy} className={`rounded-lg p-3 text-sm font-black ${darkMode ? "bg-white/10" : "bg-slate-100"}`}>
                Cancel
              </button>
              <button
                onClick={() => saveAiApiKey({ enableAfterSave: true })}
                disabled={aiApiKeyBusy || !aiApiKeyInput.trim()}
                className="rounded-lg bg-[#71CFC2] p-3 text-sm font-black text-[#062F63] disabled:bg-slate-300 disabled:text-slate-500"
              >
                {aiApiKeyBusy ? "Saving..." : "Save and enable"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex overflow-x-auto gap-2 mb-6 pb-2 scrollbar-hide">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-full whitespace-nowrap font-bold text-sm transition flex items-center gap-2 ${activeTab === tab.id ? "bg-[#71CFC2] text-[#062F63] shadow-md" : darkMode ? "bg-white/10 text-slate-300" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? <div className={panelClass}>Loading settings...</div> : (
        <div className="space-y-5">
          {activeTab === "profile" && (
            <section className={panelClass}>
              <SectionTitle icon={<UserRound size={20} />} title="Profile & Contact Information" subtitle="Shown on your dashboard, CPD records and shared professional areas." darkMode={darkMode} />
              <div className="grid gap-3">
                <div className={`rounded-lg p-4 flex items-center gap-4 ${darkMode ? "bg-white/5" : "bg-[#F0F6F5]"}`}>
                  <div className="h-20 w-20 rounded-2xl bg-[#71CFC2] text-[#062F63] grid place-items-center text-2xl font-black shrink-0 overflow-hidden">
                    {profileForm.avatar_url ? <img src={profileForm.avatar_url} alt="Profile" className="h-full w-full object-cover" /> : <ImageIcon size={28} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm mb-1">Profile image</p>
                    <p className="text-xs opacity-60 mb-3">Upload a small JPG, PNG, WebP or GIF under 2 MB.</p>
                    <label className="inline-flex items-center gap-2 rounded-lg bg-[#71CFC2] text-[#062F63] px-3 py-2 text-xs font-black cursor-pointer">
                      {uploadingAvatar ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                      {uploadingAvatar ? "Uploading..." : "Upload Image"}
                      <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} disabled={uploadingAvatar} />
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-3">
                  <input className={fieldClass} placeholder="Title" value={profileForm.title} onChange={(e) => updateProfile("title", e.target.value)} />
                  <input className={fieldClass} placeholder="Full name" value={profileForm.full_name} onChange={(e) => updateProfile("full_name", e.target.value)} />
                </div>
                <input className={fieldClass} placeholder="Practice / organisation" value={profileForm.practice_name} onChange={(e) => updateProfile("practice_name", e.target.value)} />
                <InputWithIcon icon={<MapPin size={16} />}><input className={`${fieldClass} pl-10`} placeholder="Location" value={profileForm.location} onChange={(e) => updateProfile("location", e.target.value)} /></InputWithIcon>
                <InputWithIcon icon={<Mail size={16} />}><input className={`${fieldClass} pl-10`} placeholder="Email address" value={profileForm.email} onChange={(e) => updateProfile("email", e.target.value)} /></InputWithIcon>
                <div className="grid grid-cols-2 gap-3">
                  <InputWithIcon icon={<Phone size={16} />}><input className={`${fieldClass} pl-10`} placeholder="Phone" value={profileForm.phone} onChange={(e) => updateProfile("phone", e.target.value)} /></InputWithIcon>
                  <InputWithIcon icon={<Phone size={16} />}><input className={`${fieldClass} pl-10`} placeholder="Mobile" value={profileForm.mobile} onChange={(e) => updateProfile("mobile", e.target.value)} /></InputWithIcon>
                </div>
                <InputWithIcon icon={<Globe size={16} />}><input className={`${fieldClass} pl-10`} placeholder="Website" value={profileForm.website} onChange={(e) => updateProfile("website", e.target.value)} /></InputWithIcon>
                <textarea className={fieldClass} rows="3" placeholder="Biography / About me" value={profileForm.bio} onChange={(e) => updateProfile("bio", e.target.value)} />
                <textarea className={fieldClass} rows="2" placeholder="Home address" value={profileForm.home_address} onChange={(e) => updateProfile("home_address", e.target.value)} />
                <textarea className={fieldClass} rows="2" placeholder="Work / practice address" value={profileForm.work_address} onChange={(e) => updateProfile("work_address", e.target.value)} />
              </div>
              <SaveButton saving={saving} onClick={saveProfile} label="Save Profile" />
            </section>
          )}

          {activeTab === "professional" && (
            <section className={panelClass}>
              <SectionTitle icon={<Briefcase size={20} />} title="Professional Information" subtitle="Qualifications, memberships and clinical interests." darkMode={darkMode} />
              <div className="grid gap-3">
                <input className={fieldClass} placeholder="Qualifications" value={profileForm.qualifications} onChange={(e) => updateProfile("qualifications", e.target.value)} />
                <input className={fieldClass} placeholder="Degrees" value={profileForm.degrees} onChange={(e) => updateProfile("degrees", e.target.value)} />
                <input className={fieldClass} placeholder="Certifications" value={profileForm.certifications} onChange={(e) => updateProfile("certifications", e.target.value)} />
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
                    className={`mt-2 rounded-lg px-3 py-2 text-xs font-black flex items-center gap-2 ${darkMode ? "bg-red-500/15 text-red-200" : "bg-red-50 text-red-600"}`}
                  >
                    <Trash2 size={14} />
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
              <div className={`${darkMode ? "bg-black/20" : "bg-[#F0F6F5]"} rounded-lg p-4 text-sm opacity-80`}>Security and account deletion controls can be connected to Supabase Auth when you are ready.</div>
              <SaveButton saving={saving} onClick={savePreferences} label="Save Application Settings" />
            </section>
          )}
        </div>
      )}
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
