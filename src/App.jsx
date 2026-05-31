import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LogOut, Moon, Sun } from "lucide-react";
import { Toaster } from "react-hot-toast";

import Navbar from "./components/Navbar";
import { supabase } from "./supabaseClient";

import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Analytics from "./pages/Analytics";
import FutureReading from "./pages/FutureReading";

function App() {
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [loading,setLoading]=useState(true)
  const [darkMode,setDarkMode]=useState(()=>localStorage.getItem("vetlearn-theme")==="dark")

  useEffect(()=>{
    localStorage.setItem("vetlearn-theme",darkMode?"dark":"light")
  },[darkMode])

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session)
      setLoading(false)
    })

    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{
      setSession(nextSession)
    })

    return ()=>subscription.unsubscribe()
  },[])

  useEffect(()=>{
    const loadProfile=async()=>{
      if(!session?.user){
        setProfile(null)
        return
      }

      const {data}=await supabase
        .from("profiles")
        .select("*")
        .eq("id",session.user.id)
        .single()

      setProfile(data||null)
    }

    loadProfile()
  },[session])

  const signOut=async()=>{
    await supabase.auth.signOut()
  }

  const shellClass=darkMode
    ?"min-h-screen bg-gradient-to-b from-[#071A24] to-[#0D2D35] text-slate-100"
    :"min-h-screen bg-gradient-to-b from-[#F9FCFB] to-[#EAF5F3] text-[#113247]"

  if(loading){
    return(
      <>
        <Toaster position="top-center"/>
        <div className={shellClass + " grid place-items-center font-bold"}>
          Loading VetLearn...
        </div>
      </>
    )
  }

  if(!session){
    return(
      <>
        <Toaster position="top-center"/>
        <AuthPage />
      </>
    )
  }

  const displayName=profile?.full_name||session.user.user_metadata?.full_name||session.user.email

  return (
    <BrowserRouter>
      <Toaster position="top-center"/>
      <div className={shellClass}>

        <div className={`sticky top-0 z-40 border-b backdrop-blur-xl ${darkMode?"border-white/10 bg-[#071A24]/85":"border-[#DCEDEA] bg-white/85"}`}>

          <div className="max-w-md mx-auto px-5 py-3">

            <div className="flex items-center justify-between gap-3">

              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/logo.png"
                  alt="VetLearn CPD"
                  className="w-12 h-12 object-contain shrink-0"
                />

                <div className="min-w-0">
                  <h1 className={`text-xl font-black tracking-normal ${darkMode?"text-white":"text-[#113247]"}`}>
                    VetLearn
                  </h1>

                  <p className="text-sm text-[#0F8F83] font-semibold truncate">
                    {displayName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={()=>setDarkMode(!darkMode)}
                  className={`h-10 w-10 rounded-full grid place-items-center shrink-0 ${darkMode?"bg-white/10 text-[#71CFC2]":"bg-[#E8F8F5] text-[#0B3760]"}`}
                  aria-label="Toggle dark mode"
                >
                  {darkMode?<Sun size={18}/>:<Moon size={18}/>} 
                </button>

                <button
                  onClick={signOut}
                  className={`h-10 w-10 rounded-full grid place-items-center shrink-0 ${darkMode?"bg-white/10 text-slate-100":"bg-[#E8F8F5] text-[#0B3760]"}`}
                  aria-label="Sign out"
                >
                  <LogOut size={18}/>
                </button>
              </div>

            </div>

          </div>

        </div>

        <div className="max-w-md mx-auto min-h-screen px-4 pt-5 pb-28">

          <Routes>
            <Route path="/" element={<Dashboard user={session.user} profile={profile} darkMode={darkMode} />} />
            <Route path="/future" element={<FutureReading user={session.user} darkMode={darkMode} />} />
            <Route path="/history" element={<History user={session.user} darkMode={darkMode} />} />
            <Route path="/analytics" element={<Analytics user={session.user} darkMode={darkMode} />} />
          </Routes>

        </div>

        <Navbar darkMode={darkMode} />

      </div>
    </BrowserRouter>
  );
}

export default App;