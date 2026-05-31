import DashboardCards from "../components/DashboardCards";
import ReadingForm from "../components/ReadingForm";
import { Cloud } from "lucide-react";

export default function Dashboard({user,profile,darkMode=false,activeReading,onStartReading,onFinishReading,savingReading=false}){

const firstName=(profile?.full_name||user?.user_metadata?.full_name||"there").split(" ")[0]

return(

<div>

<div
className={`
relative
overflow-hidden
bg-gradient-to-br
border
rounded-lg
p-6
mb-6
shadow-[0_18px_45px_rgba(11,55,96,0.08)]
${darkMode?"from-[#12323A] to-[#0B242B] border-white/10 text-white":"from-white to-[#DFF7F3] border-[#CDEBE7] text-[#113247]"}
`}
>

<img
src="/logo.png"
alt=""
aria-hidden="true"
className="
absolute
-right-8
-bottom-12
w-44
h-44
object-contain
opacity-[0.12]
pointer-events-none
"
/>

<div className="relative">

<div className="flex items-center gap-2 mb-5 flex-wrap">

<span className={`${darkMode?"bg-white/10 text-[#71CFC2] border-white/10":"bg-white text-[#0B3760] border-[#DCEDEA]"} border rounded-full px-3 py-2 text-xs font-bold`}>
35 hr target
</span>

<span className={`${darkMode?"bg-white/10 text-slate-100 border-white/10":"bg-white text-[#0F8F83] border-[#DCEDEA]"} border rounded-full px-3 py-2 text-xs font-bold flex items-center gap-1`}>
<Cloud size={13}/>
Supabase sync
</span>

</div>

<h2
className="
text-3xl
font-black
leading-tight
tracking-normal
mb-2
"
>
Good evening, {firstName}
</h2>

<p
className={`text-sm leading-6 max-w-[260px] ${darkMode?"text-slate-300":"text-slate-600"}`}
>
Your CPD records and future reading are saved to your profile, so they follow you between devices.
</p>

</div>

</div>

<DashboardCards user={user} darkMode={darkMode}/>

<ReadingForm
  user={user}
  darkMode={darkMode}
  activeReading={activeReading}
  onStartReading={onStartReading}
  onFinishReading={onFinishReading}
  savingReading={savingReading}
/>

</div>

)

}
