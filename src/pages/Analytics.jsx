import {
useEffect,
useState
}
from "react"

import {
supabase
}
from "../supabaseClient"

import {

PieChart,
Pie,
Cell,

ResponsiveContainer,

BarChart,
Bar,

XAxis,
YAxis,
Tooltip

}
from "recharts"

import {
  BookOpen,
  CalendarDays,
  Clock3,
  GraduationCap,
  TrendingUp
} from "lucide-react"

export default function Analytics({user,darkMode=false}){

const [data,setData]=useState([])
const [weekly,setWeekly]=useState([])
const [topCategory,setTopCategory]=useState("None yet")

const [stats,setStats]=useState({

articles:0,
hours:0,
cpd:0,
streak:0

})

useEffect(()=>{

loadData()

},[user])

const loadData=async()=>{

if(!user) return

const {data}=await supabase
.from("cpd_reading")
.select("*")
.eq("user_id",user.id)
.order("created_at",{ascending:true})

if(!data) return

const totalMinutes=data.reduce(

(sum,item)=>

sum+
(item.duration_minutes||0),

0

)

const categories={}

data.forEach(item=>{

categories[item.category]=

(categories[item.category]||0)+(item.duration_minutes||0)

})

const chartData=

Object.keys(categories)
.map(key=>({

name:key,
value:Number((categories[key]/60).toFixed(1))

}))

setData(chartData)

const top=chartData.sort((a,b)=>b.value-a.value)[0]
setTopCategory(top?.name||"None yet")

const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
const weeklyTotals=days.map(day=>({name:day,value:0}))

data.forEach(item=>{
  const date=new Date(item.created_at||item.finished_at||Date.now())
  const day=date.getDay()
  weeklyTotals[day].value+=Number(((item.duration_minutes||0)/60).toFixed(2))
})

setWeekly(weeklyTotals.map(item=>({
  ...item,
  value:Number(item.value.toFixed(1))
})))

const annualTarget=35
const hours=Number((totalMinutes/60).toFixed(1))

setStats({

articles:data.length,

hours:hours.toFixed(1),

cpd:Math.min(Math.round((hours/annualTarget)*100),100),

streak:7

})

}

const panel=darkMode
  ?"bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
  :"bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]"

const textMuted=darkMode?"text-slate-300":"text-slate-500"
const textMain=darkMode?"text-white":"text-[#113247]"

const statCards=[
  {label:"Articles",value:stats.articles,icon:<BookOpen size={18}/>},
  {label:"Hours",value:stats.hours,icon:<Clock3 size={18}/>},
  {label:"Target",value:`${stats.cpd}%`,icon:<GraduationCap size={18}/>},
  {label:"Top",value:topCategory,icon:<TrendingUp size={18}/>}
]

return(

<div>

<div className={`relative overflow-hidden bg-gradient-to-br border rounded-lg p-6 mb-6 shadow-[0_18px_45px_rgba(11,55,96,0.08)] ${darkMode?"from-[#12323A] to-[#0B242B] border-white/10":"from-white to-[#DFF7F3] border-[#CDEBE7]"}`}>

<img
src="/logo.png"
alt=""
aria-hidden="true"
className="absolute -right-8 -bottom-12 w-44 h-44 object-contain opacity-[0.10] pointer-events-none"
/>

<div className="relative">
<div className={`${darkMode?"bg-white/10 text-[#71CFC2] border-white/10":"bg-white text-[#0F8F83] border-[#DCEDEA]"} w-fit border rounded-full px-3 py-2 text-xs font-bold mb-5 flex items-center gap-1`}>
<CalendarDays size={13}/>
This year
</div>

<h1 className={`text-3xl font-black leading-tight tracking-normal mb-2 ${textMain}`}>
Analytics
</h1>

<p className={`text-sm leading-6 max-w-[260px] ${textMuted}`}>
Track CPD progress, category balance, and weekly reading patterns from your synced records.
</p>
</div>

</div>

<div className="grid grid-cols-2 gap-3 mb-6">

{statCards.map(card=>(
<div key={card.label} className={panel}>
<div className={`${darkMode?"bg-white/10 text-[#71CFC2]":"bg-[#E8F8F5] text-[#0B3760]"} w-fit p-3 rounded-lg mb-4`}>
{card.icon}
</div>
<div className={`text-2xl font-black leading-tight ${textMain}`}>
{card.value}
</div>
<div className={`text-sm ${textMuted}`}>
{card.label}
</div>
</div>
))}

</div>

<div className={panel + " mb-5"}>

<div className={`font-black mb-1 ${textMain}`}>
Category Hours
</div>
<p className={`text-sm mb-4 ${textMuted}`}>
Where your CPD time is going.
</p>

<div style={{
width:"100%",
height:250
}}>

<ResponsiveContainer>

<PieChart>

<Pie
data={data}
dataKey="value"
nameKey="name"
outerRadius={85}
innerRadius={46}
paddingAngle={3}
>

{data.map((entry,index)=>(

<Cell
key={index}
fill={["#71CFC2","#0B3760","#0F8F83","#A7E8DF","#8AA8BD"][index%5]}
/>

))}

</Pie>
<Tooltip/>

</PieChart>

</ResponsiveContainer>

</div>

</div>

<div className={panel}>

<div className={`font-black mb-1 ${textMain}`}>
Weekly Reading
</div>
<p className={`text-sm mb-4 ${textMuted}`}>
Hours logged by day of the week.
</p>

<div style={{
width:"100%",
height:250
}}>

<ResponsiveContainer>

<BarChart
data={weekly}
>

<XAxis
dataKey="name"
stroke={darkMode?"#CBD5E1":"#64748B"}
/>

<YAxis stroke={darkMode?"#CBD5E1":"#64748B"}/>
<Tooltip/>

<Bar
dataKey="value"
fill="#71CFC2"
radius={[8,8,0,0]}
/>

</BarChart>

</ResponsiveContainer>

</div>

</div>

</div>

)

}