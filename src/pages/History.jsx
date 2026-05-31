import { useEffect,useState } from "react";
import { supabase } from "../supabaseClient";

import {

Search,
Download,
Clock3,
Trash2,
Save,
Sparkles,
Loader2,
ExternalLink

}

from "lucide-react";

import toast from "react-hot-toast";

import { exportCPD } from "../utils/pdfExport";

import { generateReflection }
from "../utils/aiReflection";

export default function History({user}){

const [history,setHistory]=useState([])

const [search,setSearch]=useState("")

const [loadingId,setLoadingId]=useState(null)

useEffect(()=>{

loadHistory()

},[user])

const loadHistory=async()=>{

if(!user) return

const {data}=await supabase
.from("cpd_reading")
.select("*")
.eq("user_id",user.id)
.order(
"created_at",
{ascending:false}
)

setHistory(data||[])

}

const deleteEntry=async(id)=>{

setLoadingId(id)

const {error}=await supabase
.from("cpd_reading")
.delete()
.eq(
"id",
id
)
.eq("user_id",user.id)

if(error){
  toast.error(error.message)
  setLoadingId(null)
  return
}

setHistory(

history.filter(
item=>
item.id!==id
)

)

window.dispatchEvent(
new Event(
"cpdUpdated"
)
)

toast.success(
"Entry deleted"
)

setLoadingId(null)

}

const saveReflection=
async(item)=>{

setLoadingId(item.id)

const {error}=await supabase
.from("cpd_reading")
.update({

reflection:
item.user_reflection,

user_reflection:
item.user_reflection

})
.eq(
"id",
item.id
)
.eq("user_id",user.id)

if(error){
  toast.error(error.message)
  setLoadingId(null)
  return
}

toast.success(
"Reflection saved"
)

setLoadingId(null)

}

const generateAIReflection=
async(item)=>{

setLoadingId(item.id)

const ai=

await generateReflection(
item.title,
item.category
)

const updated=

history.map(h=>

h.id===item.id

?

{
...h,
user_reflection:ai
}

:

h

)

setHistory(updated)

setLoadingId(null)

}

const updateLocal=(
id,
value
)=>{

setHistory(

history.map(item=>

item.id===id

?

{
...item,
user_reflection:value
}

:

item

)

)

}

const filtered=

history.filter(item=>

item.title
?.toLowerCase()
.includes(
search.toLowerCase()
)

)

return(

<div>

<h1 className="text-3xl font-black mb-5">

History

</h1>

<div className="bg-white/90 border border-[#DCEDEA] rounded-lg p-3 mb-5 flex gap-2">

<Search size={18}/>

<input
placeholder="Search..."
className="w-full outline-none bg-transparent"
value={search}
onChange={(e)=>
setSearch(
e.target.value
)
}
/>

<button
onClick={()=>
exportCPD(
filtered
)
}
>

<Download/>

</button>

</div>

<div className="space-y-4">

{filtered.map(item=>(

<div
key={item.id}
className="bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_10px_24px_rgba(11,55,96,0.06)]"
>

<div className="flex justify-between gap-3">

<div>

<div className="font-black text-[#113247]">

{item.title}

</div>

<div className="text-sm text-slate-500">

{item.category}

</div>

</div>

<div className="flex gap-2 text-[#0B3760] text-sm font-bold">

<Clock3 size={16}/>

{item.duration_minutes}
m

</div>

</div>

{item.article_url&&(
<a
href={item.article_url}
target="_blank"
rel="noreferrer"
className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#0F8F83] bg-[#E8F8F5] rounded-lg px-3 py-2 break-all"
>
<ExternalLink size={15}/>
{item.article_url}
</a>
)}

<textarea
rows="5"
className="w-full bg-[#F0F6F5] rounded-lg p-4 mt-4 outline-none"
value={
item.user_reflection||""
}
onChange={(e)=>
updateLocal(
item.id,
e.target.value
)
}
/>

<div className="flex justify-end gap-3 mt-3">

<button
className="bg-[#E8F8F5] text-[#0B3760] rounded-lg p-3"
onClick={()=>
generateAIReflection(item)
}
>

<Sparkles/>

</button>

<button
className="bg-[#E8F8F5] text-[#0B3760] rounded-lg p-3"
onClick={()=>
saveReflection(item)
}
>

<Save/>

</button>

<button
className="bg-slate-100 text-slate-500 rounded-lg p-3"
onClick={()=>
deleteEntry(item.id)
}
>

{
loadingId===item.id

?

<Loader2
className="animate-spin"
/>

:

<Trash2/>

}

</button>

</div>

</div>

))}

</div>

</div>

)

}