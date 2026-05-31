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
YAxis

}
from "recharts"

export default function Analytics({user}){

const [data,setData]=useState([])

const [stats,setStats]=useState({

articles:0,
hours:0,
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

if(!data) return

setStats({

articles:data.length,

hours:(
data.reduce(

(sum,item)=>

sum+
(item.duration_minutes||0),

0

)/60

).toFixed(1),

streak:7

})

const categories={}

data.forEach(item=>{

categories[item.category]=

(categories[item.category]||0)+1

})

const chartData=

Object.keys(categories)
.map(key=>({

name:key,
value:categories[key]

}))

setData(chartData)

}

return(

<div>

<h1 className="text-3xl font-black mb-6">

Analytics

</h1>

<div className="grid grid-cols-3 gap-3 mb-6">

<div className="bg-white/90 border border-[#DCEDEA] p-4 rounded-lg">

<div className="text-2xl font-black text-[#0B3760]">

{stats.articles}

</div>

<div className="text-sm text-slate-500">

Articles

</div>

</div>

<div className="bg-white/90 border border-[#DCEDEA] p-4 rounded-lg">

<div className="text-2xl font-black text-[#0B3760]">

{stats.hours}

</div>

<div className="text-sm text-slate-500">

Hours

</div>

</div>

<div className="bg-white/90 border border-[#DCEDEA] p-4 rounded-lg">

<div className="text-2xl font-black text-[#0B3760]">

{stats.streak}

</div>

<div className="text-sm text-slate-500">

Day Streak

</div>

</div>

</div>

<div className="bg-white/90 border border-[#DCEDEA] rounded-lg p-5 mb-5">

<div className="font-black mb-3">

Category Breakdown

</div>

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
outerRadius={80}
>

{data.map((entry,index)=>(

<Cell
key={index}
fill={["#71CFC2","#0B3760","#0F8F83","#A7E8DF","#8AA8BD"][index%5]}
/>

))}

</Pie>

</PieChart>

</ResponsiveContainer>

</div>

</div>

<div className="bg-white/90 border border-[#DCEDEA] rounded-lg p-5">

<div className="font-black mb-3">

Weekly Reading

</div>

<div style={{
width:"100%",
height:250
}}>

<ResponsiveContainer>

<BarChart
data={data}
>

<XAxis
dataKey="name"
/>

<YAxis/>

<Bar
dataKey="value"
fill="#71CFC2"
/>

</BarChart>

</ResponsiveContainer>

</div>

</div>

</div>

)

}