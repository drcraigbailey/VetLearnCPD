import { useState } from "react";
import { supabase } from "../supabaseClient";
import { generateReflection } from "../utils/aiReflection";

import toast from "react-hot-toast";

import {
Loader2,
Check,
Sparkles,
Cloud,
FileText,
Search
}
from "lucide-react";

export default function ReadingForm({user}){

const [title,setTitle]=useState("")
const [url,setUrl]=useState("")
const [category,setCategory]=useState("Medicine")
const [template,setTemplate]=useState("rcvs")

const [notes,setNotes]=useState("")
const [reflection,setReflection]=useState("")

const [reading,setReading]=useState(false)
const [timer,setTimer]=useState("0 min")

const [startTime,setStartTime]=useState(null)

const [saving,setSaving]=useState(false)
const [generating,setGenerating]=useState(false)
const [fetchingTitle,setFetchingTitle]=useState(false)

const categories=[

"Medicine",
"Surgery",
"Emergency",
"Dermatology",
"Cardiology",
"Neurology"

]

const templates={
  rcvs:`What did I learn?

How is this relevant to my clinical work or professional role?

What will I change, consider, or do differently as a result?

What further learning or follow-up is needed?`,
  clinical:`Clinical question:

Key evidence or learning points:

How I will apply this in practice:

Risks, limitations, or cases where this may not apply:`,
  quick:`Key learning:

Practical takeaway:

Follow-up action:`
}

const fieldClass="w-full bg-[#F0F6F5] border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-4 mb-3 transition text-[#113247]"

const extractPubmedId=(value)=>{
  const trimmed=value.trim()
  if(!trimmed) return null

  const pubmedMatch=trimmed.match(/pubmed(?:\.ncbi\.nlm\.nih\.gov)?\/?(\d+)/i)
  if(pubmedMatch?.[1]) return pubmedMatch[1]

  const ncbiMatch=trimmed.match(/[?&]id=(\d+)/i)
  if(trimmed.toLowerCase().includes("pubmed")&&ncbiMatch?.[1]) return ncbiMatch[1]

  if(/^\d{6,10}$/.test(trimmed)) return trimmed

  return null
}

const getPubmedTitle=async(value=url)=>{

try{

const id=extractPubmedId(value)

if(!id) return

setFetchingTitle(true)

const response=
await fetch(

`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${id}&retmode=json`

)

const data=
await response.json()

const article=
data.result[id]

if(article?.title){

setTitle(
article.title
)

toast.success(
"PubMed title loaded"
)

}else{
  toast.error("No PubMed title found")
}

}catch(error){

toast.error("PubMed lookup failed")
console.log(
"PubMed error:",
error
)

}finally{
  setFetchingTitle(false)
}

}

const applyTemplate=()=>{
  const next=templates[template]

  if(reflection.trim()){
    setReflection(`${reflection.trim()}\n\n${next}`)
  }else{
    setReflection(next)
  }

  toast.success("Reflection template added")
}

const startReading=()=>{

const now=
new Date()

setStartTime(now)

setReading(true)

toast.success(
"Reading started"
)

const interval=
setInterval(()=>{

const mins=
Math.floor(

(new Date()-now)
/(1000*60)

)

setTimer(
`${mins} min`
)

},1000)

window.cpdTimer=
interval

}

const generateAI=
async()=>{

if(!title){

toast.error(
"Enter article title first"
)

return

}

setGenerating(
true
)

toast.loading(
"Generating reflection...",
{
id:"ai"
}
)

const result=

await generateReflection(

title,
category,
notes,
reflection

)

setReflection(
result
)

setGenerating(
false
)

toast.success(
"Reflection generated",
{
id:"ai"
}
)

}

const finishReading=
async()=>{

if(!user){
  toast.error("Please sign in first")
  return
}

setSaving(
true
)

toast.loading(
"Saving to Supabase...",
{
id:"save"
}
)

clearInterval(
window.cpdTimer
)

const finish=
new Date()

const duration=
Math.max(

1,

Math.round(

(finish-startTime)
/(1000*60)

)

)

const {error}=

await supabase
.from(
"cpd_reading"
)
.insert({

user_id:user.id,

title,

article_url:url,

category,

notes,

started_at:
startTime,

finished_at:
finish,

duration_minutes:
duration,

reflection,

user_reflection:
reflection,

ai_reflection:
reflection

})

if(error){

toast.error(

error.message,

{
id:"save"
}

)

setSaving(
false
)

return

}

window.dispatchEvent(

new Event(
"cpdUpdated"
)

)

toast.success(

"Saved and synced",

{
id:"save"
}

)

setTitle("")
setUrl("")
setNotes("")
setReflection("")

setCategory(
"Medicine"
)

setReading(false)

setTimer(
"0 min"
)

setSaving(false)

}

return(

<div className="bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]">

<div className="mb-5 flex items-start justify-between gap-3">

<div>
<h2 className="font-black text-lg text-[#113247]">

New Reading

</h2>

<p className="text-sm text-slate-500">

Track articles and generate reflections

</p>
</div>

<div className="bg-[#E8F8F5] text-[#0B3760] rounded-full px-3 py-2 text-xs font-bold flex items-center gap-1 shrink-0">
<Cloud size={14}/>
Cloud sync
</div>

</div>

<input
className={fieldClass}
placeholder="Article title"
value={title}
onChange={(e)=>
setTitle(
e.target.value
)
}
/>

<div className="flex gap-2 mb-3">
<input
className="w-full bg-[#F0F6F5] border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-4 transition text-[#113247]"
placeholder="PubMed link, PMID, or article URL"
value={url}
onChange={(e)=>{

setUrl(
e.target.value
)

}}
onBlur={()=>getPubmedTitle(url)}
/>

<button
className="w-14 rounded-lg bg-[#E8F8F5] text-[#0B3760] grid place-items-center shrink-0"
onClick={()=>getPubmedTitle(url)}
disabled={fetchingTitle}
aria-label="Fetch PubMed title"
>
{fetchingTitle?<Loader2 size={18} className="animate-spin"/>:<Search size={18}/>} 
</button>
</div>

<select
className={fieldClass}
value={category}
onChange={(e)=>
setCategory(
e.target.value
)
}
>

{categories.map(cat=>(

<option
key={cat}
>

{cat}

</option>

))}

</select>

<textarea
rows="3"
placeholder="Key learning points or notes..."
className={fieldClass}
value={notes}
onChange={(e)=>
setNotes(
e.target.value
)
}
/>

<div className="grid grid-cols-[1fr_auto] gap-2 mb-3">
<select
className="w-full bg-[#F0F6F5] border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-4 transition text-[#113247]"
value={template}
onChange={(e)=>setTemplate(e.target.value)}
>
<option value="rcvs">RCVS-style reflection</option>
<option value="clinical">Clinical case reflection</option>
<option value="quick">Quick CPD note</option>
</select>

<button
className="bg-[#E8F8F5] text-[#0B3760] rounded-lg px-4 font-bold grid place-items-center"
onClick={applyTemplate}
aria-label="Add reflection template"
>
<FileText size={18}/>
</button>
</div>

<button
onClick={generateAI}
disabled={generating}
className="w-full bg-[#0B3760] text-white rounded-lg p-4 mb-4 flex justify-center items-center gap-2 disabled:opacity-50 font-bold shadow-[0_12px_24px_rgba(11,55,96,0.16)]"
>

{

generating

?

<>

<Loader2
size={18}
className="animate-spin"
/>

Generating...

</>

:

<>

<Sparkles
size={18}
/>

Generate AI Reflection

</>

}

</button>

<textarea
rows="7"
placeholder="Write your own reflection or edit AI-generated reflection..."
className={fieldClass}
value={reflection}
onChange={(e)=>
setReflection(
e.target.value
)
}
/>

<div className="mb-4 text-sm text-slate-600">

Reading time:

<strong className="text-[#0B3760]">

 {timer}

</strong>

</div>

{

!reading

?

<button
className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-4 font-black shadow-[0_12px_24px_rgba(15,143,131,0.16)]"
onClick={startReading}
>

Start Reading

</button>

:

<button
disabled={saving}
onClick={finishReading}
className="w-full bg-[#0F8F83] text-white rounded-lg p-4 flex justify-center items-center gap-2 font-bold"
>

{

saving

?

<>

<Loader2
className="animate-spin"
size={18}
/>

Saving...

</>

:

<>

<Check
size={18}
/>

Finish + Save

</>

}

</button>

}

</div>

)

}