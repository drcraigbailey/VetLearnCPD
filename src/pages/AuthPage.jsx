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
  Fingerprint
} from "lucide-react";

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
      const {error}=await supabase.auth.signUp({
        email:cleanEmail,
        password,
        options:{
          data:{
            full_name:name.trim()||cleanEmail.split("@")[0],
            rcvs_number:rcvsNumber.trim()
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

  return(
    <div className="min-h-screen bg-gradient-to-b from-[#F9FCFB] to-[#EAF5F3] text-[#113247] px-4 py-8">
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
              onClick={()=>setMode("login")}
            >
              Login
            </button>
            <button
              className={`rounded-lg p-3 text-sm font-black transition-colors ${mode==="signup"?"bg-white text-[#0B3760] shadow-sm":"text-slate-500"}`}
              onClick={()=>setMode("signup")}
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

          <button
            className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-4 font-black shadow-[0_12px_24px_rgba(15,143,131,0.16)] disabled:opacity-50 flex items-center justify-center gap-2 mt-2 transition-opacity hover:opacity-90"
            onClick={submit}
            disabled={loading}
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
