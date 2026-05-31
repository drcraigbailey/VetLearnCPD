import {
BookOpen,
Clock3,
GraduationCap
}
from "lucide-react";

export default function DashboardCards(){

const cards=[

{

title:"Articles",
value:"12",
icon:<BookOpen size={18}/>

},

{

title:"Hours",
value:"4.5",
icon:<Clock3 size={18}/>

},

{

title:"CPD",
value:"68%",
icon:<GraduationCap size={18}/>

}

]

return(

<div className="grid grid-cols-3 gap-3 mb-6">

{cards.map((card,index)=>(

<div

key={index}

className="
bg-white
rounded-[28px]
p-4
shadow-sm
"

>

<div
className="
bg-[#E8F8F5]
w-fit
p-3
rounded-2xl
mb-4
text-[#062F63]
"
>

{card.icon}

</div>

<div
className="
text-2xl
font-bold
text-[#062F63]
"
>

{card.value}

</div>

<div
className="
text-xs
text-slate-500
"
>

{card.title}

</div>

</div>

))}

</div>

)

}