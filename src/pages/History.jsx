import { useEffect,useState } from "react";
import { supabase } from "../supabaseClient";

import {

Search,
Download,
Clock3,
BookOpen,
Trash2,
Save,
Sparkles,
Loader2

}

from "lucide-react";

import toast from "react-hot-toast";

import { exportCPD } from "../utils/pdfExport";

import { generateReflection }
from "../utils/aiReflection";

export default function History(){

const [history,setHistory]=useState([])

const [search,setSearch]=useState("")

const [loadingId,setLoadingId]=useState(null)

useEffect(()=>{

loadHistory()

},[])

const loadHistory=async()=>{

const {data}=await supabase
.from("cpd_reading")
.select("*")
.order(
"created_at",
{ascending:false}
)

setHistory(data||[])

}

const deleteEntry=async(id)=>{

setLoadingId(id)

await supabase
.from("cpd_reading")
.delete()
.eq(
"id",
id
)

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

await supabase
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

<h1 className="text-3xl font-bold mb-5">

History

</h1>

<div className="bg-white rounded-2xl p-3 mb-5 flex gap-2">

<Search size={18}/>

<input
placeholder="Search..."
className="w-full outline-none"
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
className="bg-white rounded-3xl p-5 shadow-sm"
>

<div className="flex justify-between">

<div>

<div className="font-bold">

{item.title}

</div>

<div className="text-sm text-slate-500">

{item.category}

</div>

</div>

<div className="flex gap-2">

<Clock3 size={16}/>

{item.duration_minutes}
m

</div>

</div>

<textarea
rows="5"
className="w-full bg-slate-100 rounded-2xl p-4 mt-4"
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
onClick={()=>
generateAIReflection(item)
}
>

<Sparkles/>

</button>

<button
onClick={()=>
saveReflection(item)
}
>

<Save/>

</button>

<button
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