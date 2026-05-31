import { useState } from "react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";

import {
  Loader2,
  LogIn,
  UserPlus
} from "lucide-react";

export default function AuthPage(){

const [mode,setMode]=useState("login")
const [name,setName]=useState("")
const [email,setEmail]=useState("")
const [password,setPassword]=useState("")
const [loading,setLoading]=useState(false)

const fieldClass="w-full bg-[#F0F6F5] border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-4 mb-3 transition"

const submit=async()=>{
  const cleanEmail=email.trim().toLowerCase()

  if(!cleanEmail||!password){
    toast.error("Add your email and password")
    return
  }

  setLoading(true)

  if(mode==="login"){
    const {error}=await supabase.auth.signInWithPassword({
      email:cleanEmail,
      password
    })

    if(error){
      toast.error(error.message)
      setLoading(false)
      return
    }
  }else{
    const {error}=await supabase.auth.signUp({
      email:cleanEmail,
      password,
      options:{
        data:{
          full_name:name.trim()||cleanEmail.split("@")[0]
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
CPD Tracker
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
  ?"Sign in to see your own CPD records, reflections, and future reading."
  :"Set up your own VetLearn profile with private saved data."}
</p>
</div>

</div>

<div className="bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]">

<div className="grid grid-cols-2 gap-2 mb-5 bg-[#F0F6F5] rounded-lg p-1">
<button
className={`rounded-lg p-3 text-sm font-black ${mode==="login"?"bg-white text-[#0B3760] shadow-sm":"text-slate-500"}`}
onClick={()=>setMode("login")}
>
Login
</button>
<button
className={`rounded-lg p-3 text-sm font-black ${mode==="signup"?"bg-white text-[#0B3760] shadow-sm":"text-slate-500"}`}
onClick={()=>setMode("signup")}
>
Register
</button>
</div>

{mode==="signup"&&(
<input
className={fieldClass}
placeholder="Your name"
value={name}
onChange={(e)=>setName(e.target.value)}
/>
)}

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

<input
className={fieldClass}
placeholder="Password"
type="password"
autoComplete={mode==="login"?"current-password":"new-password"}
value={password}
onChange={(e)=>setPassword(e.target.value)}
/>

<button
className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-4 font-black shadow-[0_12px_24px_rgba(15,143,131,0.16)] disabled:opacity-50 flex items-center justify-center gap-2"
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

</div>

</div>

</div>

)

}