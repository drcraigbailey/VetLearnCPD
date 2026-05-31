import DashboardCards from "../components/DashboardCards";
import ReadingForm from "../components/ReadingForm";

export default function Dashboard({user,profile}){

const firstName=(profile?.full_name||user?.user_metadata?.full_name||"there").split(" ")[0]

return(

<div>

<div
className="
relative
overflow-hidden
bg-gradient-to-br
from-white
to-[#DFF7F3]
border
border-[#CDEBE7]
rounded-lg
p-6
text-[#113247]
mb-6
shadow-[0_18px_45px_rgba(11,55,96,0.08)]
"
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

<div className="flex items-center gap-2 mb-5">

<span className="bg-white text-[#0B3760] border border-[#DCEDEA] rounded-full px-3 py-2 text-xs font-bold">
35 hr target
</span>

<span className="bg-white text-[#0F8F83] border border-[#DCEDEA] rounded-full px-3 py-2 text-xs font-bold">
Your profile
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
className="
text-sm
text-slate-600
leading-6
max-w-[240px]
"
>
Keep building your own learning trail with a calmer CPD dashboard.
</p>

</div>

</div>

<DashboardCards user={user}/>

<ReadingForm user={user}/>

</div>

)

}