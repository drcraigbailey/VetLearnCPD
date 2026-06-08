import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import { getLastBiometricUser, isBiometricLoginEnabled, needsBiometricRelink, refreshBiometricAfterPasswordLogin, signInWithBiometric } from "../utils/biometricAuth";
import { getKeepMeLoggedIn, setKeepMeLoggedIn } from "../utils/sessionSecurity";

import {
  Loader2,
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
  Fingerprint,
  X
} from "lucide-react";

const CONSENT_VERSION = "2026-06-07";
const SHOW_GOOGLE_LOGIN = true;

export default function AuthPage(){

  const [mode,setMode]=useState("login")
  const [name,setName]=useState("")
  const [rcvsNumber,setRcvsNumber]=useState("")
  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  const [showPassword, setShowPassword]=useState(false)
  const [showFingerprintLogin, setShowFingerprintLogin]=useState(false)
  const [fingerprintRefreshNeeded, setFingerprintRefreshNeeded]=useState(false)
  const [keepMeLoggedIn, setKeepMeLoggedInState]=useState(() => getKeepMeLoggedIn())
  const [acceptedTerms, setAcceptedTerms]=useState(false)
  const [acceptedEmailPrivacy, setAcceptedEmailPrivacy]=useState(false)
  const [marketingOptIn, setMarketingOptIn]=useState(false)
  const [showTermsModal, setShowTermsModal]=useState(false)
  const [showEmailPrivacyModal, setShowEmailPrivacyModal]=useState(false)
  const [loading,setLoading]=useState(false)

  const fieldClass="w-full bg-[#F0F6F5] border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-4 transition"

  const checkFingerprintLogin = async () => {
    const savedUser = getLastBiometricUser();
    if (!email && savedUser?.email) setEmail(savedUser.email);
    setFingerprintRefreshNeeded(needsBiometricRelink());
    const enabled = await isBiometricLoginEnabled();
    setShowFingerprintLogin(enabled);
  };

  useEffect(() => {
    let cancelled = false;

    const runCheck = async () => {
      const savedUser = getLastBiometricUser();
      const needsRelink = needsBiometricRelink();
      const enabled = await isBiometricLoginEnabled();
      if (cancelled) return;
      if (savedUser?.email) setEmail(savedUser.email);
      setFingerprintRefreshNeeded(needsRelink);
      setShowFingerprintLogin(enabled);
    };

    runCheck();
    window.addEventListener("biometricSettingsUpdated", runCheck);

    return () => {
      cancelled = true;
      window.removeEventListener("biometricSettingsUpdated", runCheck);
    };
  }, []);

  const updateKeepMeLoggedIn = (value) => {
    setKeepMeLoggedInState(value);
    setKeepMeLoggedIn(value);
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    if (nextMode === "login") {
      setAcceptedTerms(false);
      setAcceptedEmailPrivacy(false);
      setMarketingOptIn(false);
    }
  };

  const refreshFingerprintAfterPasswordLogin = async (signedInUser, signedInSession) => {
    if (!needsBiometricRelink() || !signedInUser || !signedInSession) return;

    try {
      const refreshed = await refreshBiometricAfterPasswordLogin(signedInUser, signedInSession);
      setFingerprintRefreshNeeded(false);
      setShowFingerprintLogin(true);
      if (refreshed) toast.success("Fingerprint login refreshed for this phone");
    } catch (error) {
      setFingerprintRefreshNeeded(true);
      toast.error(error.message || "Could not refresh fingerprint login. You can turn it off and on again in Settings.");
    }
  };

  const submit=async()=>{
    const cleanEmail=email.trim().toLowerCase()

    if(!cleanEmail||!password){
      toast.error("Add your email and password")
      return
    }

    if(mode==="signup" && (!acceptedTerms || !acceptedEmailPrivacy)){
      toast.error("Please accept the Terms of Service and Email Privacy Notice to continue.")
      return
    }

    setLoading(true)

    if(mode==="login"){
      setKeepMeLoggedIn(keepMeLoggedIn)
      const { data, error }=await supabase.auth.signInWithPassword({
        email:cleanEmail,
        password
      })

      if(error){
        toast.error(error.message)
        setLoading(false)
        return
      }

      await refreshFingerprintAfterPasswordLogin(data?.user, data?.session)
    }else{
      const consentTimestamp = new Date().toISOString();
      const {error}=await supabase.auth.signUp({
        email:cleanEmail,
        password,
        options:{
          data:{
            full_name:name.trim()||cleanEmail.split("@")[0],
            rcvs_number:rcvsNumber.trim(),
            accepted_terms:true,
            accepted_terms_at:consentTimestamp,
            accepted_terms_version:CONSENT_VERSION,
            accepted_email_privacy:true,
            accepted_email_privacy_at:consentTimestamp,
            accepted_email_privacy_version:CONSENT_VERSION,
            marketing_emails_opt_in:marketingOptIn,
            marketing_emails_opt_in_at:marketingOptIn ? consentTimestamp : null,
            marketing_emails_opt_in_version:CONSENT_VERSION
          }
        }
      })

      if(error){
        toast.error(error.message)
        setLoading(false)
        return
      }

      toast.success("Account created")
    }

    setEmail(cleanEmail)
    setLoading(false)
  }

  const handleGoogleLogin = async () => {
    if (!SHOW_GOOGLE_LOGIN) {
      toast.error("Google login is currently unavailable")
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin
      }
    })

    if (error) {
      toast.error(error.message)
      setLoading(false)
    }
  }

  const handleFingerprintLogin = async () => {
    setLoading(true)
    try {
      await signInWithBiometric()
      toast.success("Signed in successfully")
    } catch (error) {
      const message = error.message || "Fingerprint login is not set up on this device.";
      if (message.includes("needs refreshing")) {
        toast("Log in once with email and password to refresh fingerprint login.")
      } else {
        toast.error(message)
      }
      await checkFingerprintLogin()
    } finally {
      setLoading(false)
    }
  }

  const signupBlocked = mode === "signup" && (!acceptedTerms || !acceptedEmailPrivacy)

  return(
    <div className="min-h-screen bg-gradient-to-b from-[#F9FCFB] to-[#EAF5F3] text-[#113247] px-4 py-8">
      {showTermsModal && <ConsentModal title="Terms of Service" onClose={()=>setShowTermsModal(false)} onAccept={()=>{ setAcceptedTerms(true); setShowTermsModal(false); }} acceptLabel="Accept Terms"><TermsContent /></ConsentModal>}
      {showEmailPrivacyModal && <ConsentModal title="Email Privacy Notice" onClose={()=>setShowEmailPrivacyModal(false)} onAccept={()=>{ setAcceptedEmailPrivacy(true); setShowEmailPrivacyModal(false); }} acceptLabel="Accept Email Privacy Notice"><EmailPrivacyContent /></ConsentModal>}

      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <img
            src="/logo.png"
            alt="VetLearn CPD"
            className="w-14 h-14 object-contain"
          />
          <div>
            <h1 className="text-2xl font-black tracking-normal">
              VetLearn
            </h1>
            <p className="text-sm text-[#0F8F83] font-semibold">
              Clinical Hub
            </p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-white to-[#DFF7F3] border border-[#CDEBE7] rounded-lg p-6 mb-6 shadow-[0_18px_45px_rgba(11,55,96,0.08)]">
          <img
            src="/logo.png"
            alt=""
            aria-hidden="true"
            className="absolute -right-8 -bottom-12 w-44 h-44 object-contain opacity-[0.10] pointer-events-none"
          />
          <div className="relative">
            <h2 className="text-3xl font-black leading-tight tracking-normal mb-2">
              {mode==="login"?"Welcome back":"Create profile"}
            </h2>
            <p className="text-sm text-slate-600 leading-6 max-w-[260px]">
              {mode==="login"
                ?"Sign in to see your own CPD records, case logs, and drug protocols."
                :"Set up your own VetLearn profile with private saved data."}
            </p>
          </div>
        </div>

        <div className="bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]">
          <div className="grid grid-cols-2 gap-2 mb-5 bg-[#F0F6F5] rounded-lg p-1">
            <button
              className={`rounded-lg p-3 text-sm font-black transition-colors ${mode==="login"?"bg-white text-[#0B3760] shadow-sm":"text-slate-500"}`}
              onClick={()=>switchMode("login")}
            >
              Login
            </button>
            <button
              className={`rounded-lg p-3 text-sm font-black transition-colors ${mode==="signup"?"bg-white text-[#0B3760] shadow-sm":"text-slate-500"}`}
              onClick={()=>switchMode("signup")}
            >
              Register
            </button>
          </div>

          {mode==="signup"&&(
            <>
              <div className="mb-3">
                <input
                  className={fieldClass}
                  placeholder="Full Name"
                  value={name}
                  onChange={(e)=>setName(e.target.value)}
                />
              </div>
              <div className="mb-3">
                <input
                  className={fieldClass}
                  placeholder="RCVS Number (Optional)"
                  value={rcvsNumber}
                  onChange={(e)=>setRcvsNumber(e.target.value)}
                />
              </div>
            </>
          )}

          {mode==="login" && fingerprintRefreshNeeded && (
            <div className="mb-3 rounded-lg border border-[#CDEBE7] bg-[#E8F8F5] p-3 text-sm text-slate-600 leading-5">
              Fingerprint login needs refreshing. Please log in once with your email and password, then fingerprint login will be saved again on this phone.
            </div>
          )}

          <div className="mb-3">
            <input
              className={fieldClass}
              placeholder="Email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              spellCheck="false"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
            />
          </div>

          <div className="relative mb-3">
            <input
              className={`${fieldClass} pr-12`}
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode==="login"?"current-password":"new-password"}
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#71CFC2] transition-colors"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {mode==="login" && (
            <label className="mb-4 flex items-start gap-3 rounded-lg border border-[#DCEDEA] bg-[#F9FCFB] p-3 text-sm text-slate-600">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[#71CFC2]"
                checked={keepMeLoggedIn}
                onChange={(event) => updateKeepMeLoggedIn(event.target.checked)}
              />
              <span>
                <span className="block font-black text-[#0B3760]">Keep me logged in</span>
                <span className="block leading-5">Turn this off to log out after 30 minutes of inactivity or after reopening the app later.</span>
              </span>
            </label>
          )}

          {mode==="signup" && (
            <div className="mb-4 space-y-3">
              <ConsentCheckbox checked={acceptedTerms} onChange={setAcceptedTerms} required>
                I have read and agree to the <button type="button" className="font-black text-[#0F8F83] underline" onClick={()=>setShowTermsModal(true)}>Terms of Service</button>
              </ConsentCheckbox>
              <ConsentCheckbox checked={acceptedEmailPrivacy} onChange={setAcceptedEmailPrivacy} required>
                I understand and agree to the <button type="button" className="font-black text-[#0F8F83] underline" onClick={()=>setShowEmailPrivacyModal(true)}>Email Privacy Notice</button>
              </ConsentCheckbox>
              <ConsentCheckbox checked={marketingOptIn} onChange={setMarketingOptIn}>
                I would like to receive optional VetLearn updates, CPD reminders and marketing emails.
                <span className="block text-xs opacity-65 mt-1">You can unsubscribe from optional emails at any time.</span>
              </ConsentCheckbox>
            </div>
          )}

          <button
            className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-4 font-black shadow-[0_12px_24px_rgba(15,143,131,0.16)] disabled:opacity-50 flex items-center justify-center gap-2 mt-2 transition-opacity hover:opacity-90"
            onClick={submit}
            disabled={loading || signupBlocked}
          >
            {loading?(
              <>
                <Loader2 size={18} className="animate-spin"/>
                Please wait...
              </>
            ):mode==="login"?(
              <>
                <LogIn size={18}/>
                Login
              </>
            ):(
              <>
                <UserPlus size={18}/>
                Create Profile
              </>
            )}
          </button>

          {mode==="signup" && signupBlocked && (
            <p className="mt-2 text-center text-xs font-bold text-orange-600">Please accept the required notices to create your profile.</p>
          )}

          {mode==="login" && SHOW_GOOGLE_LOGIN && (
            <button
              className="w-full bg-white border-2 border-[#DCEDEA] text-[#0B3760] rounded-lg p-4 font-black disabled:opacity-50 flex items-center justify-center gap-3 mt-3 hover:bg-[#F0F6F5] transition-colors"
              onClick={handleGoogleLogin}
              disabled={loading}
              type="button"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-base font-black text-[#4285F4] shadow-sm">G</span>
              Continue with Google
            </button>
          )}

          {mode==="login" && showFingerprintLogin && (
            <button
              className="w-full bg-transparent border-2 border-[#DCEDEA] text-[#0B3760] rounded-lg p-4 font-black disabled:opacity-50 flex items-center justify-center gap-2 mt-3 hover:bg-[#F0F6F5] transition-colors"
              onClick={handleFingerprintLogin}
              disabled={loading}
            >
              <Fingerprint size={18} />
              Fingerprint Login
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ConsentCheckbox({ checked, onChange, children, required = false }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-[#DCEDEA] bg-[#F9FCFB] p-3 text-sm text-slate-600">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[#71CFC2]"
        checked={checked}
        onChange={(event)=>onChange(event.target.checked)}
      />
      <span className="leading-5">
        {children}
        {required && <span className="ml-1 text-xs font-black text-orange-600">Required</span>}
      </span>
    </label>
  )
}

function ConsentModal({ title, children, onClose, onAccept, acceptLabel }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#DCEDEA] bg-white text-[#113247] shadow-2xl max-h-[86vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[#DCEDEA] p-5">
          <h3 className="text-xl font-black">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full bg-[#F0F6F5] p-2 text-[#0B3760]" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5 text-sm leading-6 text-slate-700 space-y-4">
          {children}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-[#DCEDEA] p-5">
          <button type="button" onClick={onClose} className="rounded-lg bg-[#F0F6F5] p-3 text-sm font-black text-[#0B3760]">Close</button>
          <button type="button" onClick={onAccept} className="rounded-lg bg-[#71CFC2] p-3 text-sm font-black text-[#062F63]">{acceptLabel}</button>
        </div>
      </div>
    </div>
  )
}

function TermsContent() {
  return (
    <>
      <p><strong>Terms of Service for VetLearn</strong></p>
      <p><strong>Last Updated:</strong> June 7, 2026</p>
      <p><strong>1. Introduction</strong></p>
      <p>Welcome to VetLearn. These Terms of Service constitute a legally binding agreement between you and [Insert Your Full Legal Name or Company Name] regarding your use of the VetLearn mobile application and associated web portals. By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, please do not use the Service.</p>
      <p><strong>2. Nature of the Service</strong></p>
      <p>VetLearn is a professional tool designed to support veterinary practitioners in continuing professional development and clinical management. The content, calculators, and information provided through the Service are for educational and professional support purposes only. The Service does not replace clinical judgment. You are solely responsible for all veterinary decisions, diagnoses, and treatment plans. While we strive for accuracy, we do not warrant that all information is complete, current, or error-free. You should independently verify critical clinical data.</p>
      <p><strong>3. User Obligations and Data Responsibility</strong></p>
      <p>You are responsible for maintaining the confidentiality of your account credentials. By using the Service, you acknowledge that you are the Data Controller for any clinical or patient data you input or transmit. It is your sole responsibility to ensure that you have the necessary authority and consent to process any personal or sensitive information, that your use of the Service complies with UK GDPR and all applicable data protection laws, and that you do not upload prohibited or unlawful content.</p>
      <p>You agree not to reverse-engineer, exploit, or use the Service in any way that harms our infrastructure or other users.</p>
      <p><strong>4. Intellectual Property</strong></p>
      <p>All content, features, and functionality of the Service, including software, design, text, and graphics, are the exclusive property of VetLearn and are protected by international copyright and trademark laws.</p>
      <p><strong>5. Limitation of Liability</strong></p>
      <p>To the maximum extent permitted by law, VetLearn and its developers shall not be liable for any indirect, incidental, or consequential damages resulting from your use of the Service, including errors in clinical calculations or data interpretation, loss of data or unauthorized access by third parties provided we have met industry-standard security practices, or professional liability arising from the use of the Service in a clinical setting.</p>
      <p><strong>6. Termination</strong></p>
      <p>We reserve the right to suspend or terminate your access to the Service at any time, without prior notice, if you breach these Terms or engage in conduct we deem harmful to the platform or other users.</p>
      <p><strong>7. Changes to Terms</strong></p>
      <p>We may update these Terms from time to time. We will notify you of significant changes via the app or email. Your continued use of the Service after such changes constitutes your acceptance of the updated Terms.</p>
      <p><strong>8. Governing Law</strong></p>
      <p>These Terms shall be governed by and construed in accordance with the laws of England and Wales. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of England and Wales.</p>
      <p><strong>9. Contact Us</strong></p>
      <p>If you have any questions about these Terms, please contact us at: [Insert Contact Email/Details]</p>
    </>
  )
}

function EmailPrivacyContent() {
  return (
    <>
      <p><strong>Email Privacy Notice for VetLearn</strong></p>
      <p><strong>Last Updated:</strong> June 7, 2026</p>
      <p>VetLearn uses your email address to create and manage your account, provide login and security functions, and send essential service communications.</p>
      <p><strong>1. Essential Emails</strong></p>
      <p>By creating an account, you agree that VetLearn may send you essential emails, including account verification emails, password reset emails, security alerts, important service updates, changes to Terms of Service or Privacy Policy, and account or subscription-related messages. These emails are necessary for the operation and security of your account.</p>
      <p><strong>2. Optional Emails</strong></p>
      <p>VetLearn may offer optional emails such as product updates, CPD reminders, newsletters, or marketing messages. These will only be sent where permitted by law and where you have consented or where there is another lawful basis. You can unsubscribe from optional marketing emails at any time.</p>
      <p><strong>3. Email Privacy</strong></p>
      <p>We will not sell your email address to third parties. We may use trusted service providers, such as authentication, hosting, email delivery, analytics, or infrastructure providers, to process emails on our behalf. These providers must process data only according to our instructions and applicable data protection laws.</p>
      <p><strong>4. Your Responsibilities</strong></p>
      <p>You are responsible for keeping your email account secure and ensuring that the email address linked to your VetLearn account is accurate and accessible.</p>
      <p><strong>5. Contact</strong></p>
      <p>For questions about email privacy or data protection, contact: [Insert Contact Email/Details]</p>
    </>
  )
}
