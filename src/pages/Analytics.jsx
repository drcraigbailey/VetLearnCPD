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

export default function Analytics(){

const [data,setData]=useState([])

const [stats,setStats]=useState({

articles:0,
hours:0,
streak:0

})

useEffect(()=>{

loadData()

},[])

const loadData=async()=>{

const {data}=await supabase
.from("cpd_reading")
.select("*")

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

<h1 className="text-3xl font-bold mb-6">

Analytics

</h1>

<div className="grid grid-cols-3 gap-3 mb-6">

<div className="bg-white p-4 rounded-3xl">

<div className="text-2xl font-bold">

{stats.articles}

</div>

<div className="text-sm">

Articles

</div>

</div>

<div className="bg-white p-4 rounded-3xl">

<div className="text-2xl font-bold">

{stats.hours}

</div>

<div className="text-sm">

Hours

</div>

</div>

<div className="bg-white p-4 rounded-3xl">

<div className="text-2xl font-bold">

{stats.streak}

</div>

<div className="text-sm">

Day Streak

</div>

</div>

</div>

<div className="bg-white rounded-3xl p-5 mb-5">

<div className="font-bold mb-3">

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
/>

))}

</Pie>

</PieChart>

</ResponsiveContainer>

</div>

</div>

<div className="bg-white rounded-3xl p-5">

<div className="font-bold mb-3">

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
/>

</BarChart>

</ResponsiveContainer>

</div>

</div>

</div>

)

}