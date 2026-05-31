import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LogOut } from "lucide-react";

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

  if(loading){
    return(
      <div className="min-h-screen bg-gradient-to-b from-[#F9FCFB] to-[#EAF5F3] grid place-items-center text-[#113247] font-bold">
        Loading VetLearn...
      </div>
    )
  }

  if(!session){
    return <AuthPage />
  }

  const displayName=profile?.full_name||session.user.user_metadata?.full_name||session.user.email

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-b from-[#F9FCFB] to-[#EAF5F3] text-[#113247]">

        <div className="sticky top-0 z-40 border-b border-[#DCEDEA] bg-white/85 backdrop-blur-xl">

          <div className="max-w-md mx-auto px-5 py-3">

            <div className="flex items-center justify-between gap-3">

              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/logo.png"
                  alt="VetLearn CPD"
                  className="w-12 h-12 object-contain shrink-0"
                />

                <div className="min-w-0">
                  <h1 className="text-xl font-black tracking-normal text-[#113247]">
                    VetLearn
                  </h1>

                  <p className="text-sm text-[#0F8F83] font-semibold truncate">
                    {displayName}
                  </p>
                </div>
              </div>

              <button
                onClick={signOut}
                className="h-10 w-10 rounded-full bg-[#E8F8F5] text-[#0B3760] grid place-items-center shrink-0"
                aria-label="Sign out"
              >
                <LogOut size={18}/>
              </button>

            </div>

          </div>

        </div>

        <div className="max-w-md mx-auto min-h-screen px-4 pt-5 pb-28">

          <Routes>
            <Route path="/" element={<Dashboard user={session.user} profile={profile} />} />
            <Route path="/future" element={<FutureReading user={session.user} />} />
            <Route path="/history" element={<History user={session.user} />} />
            <Route path="/analytics" element={<Analytics user={session.user} />} />
          </Routes>

        </div>

        <Navbar />

      </div>
    </BrowserRouter>
  );
}

export default App;