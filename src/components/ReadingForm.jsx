import { useState } from "react";
import { supabase } from "../supabaseClient";
import { generateReflection } from "../utils/aiReflection";

import toast from "react-hot-toast";

import {
Loader2,
Check,
Sparkles
}
from "lucide-react";

export default function ReadingForm(){

const [title,setTitle]=useState("")
const [url,setUrl]=useState("")
const [category,setCategory]=useState("Medicine")

const [notes,setNotes]=useState("")
const [reflection,setReflection]=useState("")

const [reading,setReading]=useState(false)
const [timer,setTimer]=useState("0 min")

const [startTime,setStartTime]=useState(null)

const [saving,setSaving]=useState(false)
const [generating,setGenerating]=useState(false)

const categories=[

"Medicine",
"Surgery",
"Emergency",
"Dermatology",
"Cardiology",
"Neurology"

]

const fieldClass="w-full bg-[#F0F6F5] border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-4 mb-3 transition"

const getPubmedTitle=async(url)=>{

try{

if(
!url.includes(
"pubmed"
)
)return

const id=
url.match(/\d+/)?.[0]

if(!id)
return

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
"Article title loaded"
)

}

}catch(error){

console.log(
"PubMed error:",
error
)

}

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

setSaving(
true
)

toast.loading(
"Saving CPD...",
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

"CPD Saved",

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

setSaving(
false)

}

return(

<div className="bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]">

<div className="mb-5">

<h2 className="font-black text-lg text-[#113247]">

New Reading

</h2>

<p className="text-sm text-slate-500">

Track articles and generate reflections

</p>

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

<input
className={fieldClass}
placeholder="Article URL"
value={url}
onChange={(e)=>{

setUrl(
e.target.value
)

getPubmedTitle(
e.target.value
)

}}
/>

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
rows="5"
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