import DashboardCards from "../components/DashboardCards";
import ReadingForm from "../components/ReadingForm";

export default function Dashboard(){

return(

<div>

<div
className="
bg-gradient-to-br
from-[#062F63]
to-[#0A4A8A]
rounded-[32px]
p-6
text-white
mb-6
shadow-lg
"
>

<div className="flex items-center gap-4">

<img

src="/logo.png"

className="
w-20
h-20
rounded-3xl
bg-white
p-2
"

/>

<div>

<h1
className="
font-bold
text-3xl
"
>

VetLearn

</h1>

<p
className="
text-sm
opacity-80
"
>

Veterinary CPD Hub

</p>

</div>

</div>

<div className="mt-6">

<h2
className="
text-xl
font-semibold
"
>

Good evening, Craig 👋

</h2>

<p
className="
opacity-80
text-sm
"
>

Keep building today's learning trail

</p>

</div>

</div>

<DashboardCards/>

<ReadingForm/>

</div>

)

}