import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";

import {
  BookmarkPlus,
  CalendarDays,
  Check,
  ExternalLink,
  Loader2,
  Trash2
} from "lucide-react";

export default function FutureReading({user}){

const [items,setItems]=useState([])
const [loading,setLoading]=useState(true)
const [saving,setSaving]=useState(false)
const [busyId,setBusyId]=useState(null)

const [form,setForm]=useState({
  title:"",
  url:"",
  category:"Medicine",
  priority:"Medium",
  due_date:"",
  notes:""
})

const categories=[
  "Medicine",
  "Surgery",
  "Emergency",
  "Dermatology",
  "Cardiology",
  "Neurology",
  "Other"
]

const priorities=["High","Medium","Low"]

const fieldClass="w-full bg-[#F0F6F5] border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-4 mb-3 transition"

useEffect(()=>{
  loadFutureReading()
},[user])

const loadFutureReading=async()=>{
  if(!user) return

  setLoading(true)

  const {data,error}=await supabase
    .from("future_reading")
    .select("*")
    .eq("user_id",user.id)
    .order("status",{ascending:false})
    .order("due_date",{ascending:true,nullsFirst:false})
    .order("created_at",{ascending:false})

  if(error){
    toast.error(error.message)
    setLoading(false)
    return
  }

  setItems(data||[])
  setLoading(false)
}

const updateForm=(field,value)=>{
  setForm({
    ...form,
    [field]:value
  })
}

const addItem=async()=>{
  if(!user){
    toast.error("Please sign in first")
    return
  }

  if(!form.title.trim()){
    toast.error("Add a title first")
    return
  }

  setSaving(true)

  const {error}=await supabase
    .from("future_reading")
    .insert({
      user_id:user.id,
      title:form.title.trim(),
      url:form.url.trim()||null,
      category:form.category,
      priority:form.priority,
      due_date:form.due_date||null,
      notes:form.notes.trim()||null,
      status:"planned"
    })

  if(error){
    toast.error(error.message)
    setSaving(false)
    return
  }

  toast.success("Added to future reading")
  setForm({
    title:"",
    url:"",
    category:"Medicine",
    priority:"Medium",
    due_date:"",
    notes:""
  })
  setSaving(false)
  loadFutureReading()
}

const markDone=async(item)=>{
  setBusyId(item.id)

  const nextStatus=item.status==="done"?"planned":"done"

  const {error}=await supabase
    .from("future_reading")
    .update({status:nextStatus})
    .eq("id",item.id)
    .eq("user_id",user.id)

  if(error){
    toast.error(error.message)
    setBusyId(null)
    return
  }

  setItems(items.map(existing=>
    existing.id===item.id
      ? {...existing,status:nextStatus}
      : existing
  ))

  setBusyId(null)
}

const deleteItem=async(id)=>{
  setBusyId(id)

  const {error}=await supabase
    .from("future_reading")
    .delete()
    .eq("id",id)
    .eq("user_id",user.id)

  if(error){
    toast.error(error.message)
    setBusyId(null)
    return
  }

  setItems(items.filter(item=>item.id!==id))
  toast.success("Removed")
  setBusyId(null)
}

const plannedCount=items.filter(item=>item.status!=="done").length

return(

<div>

<div className="relative overflow-hidden bg-gradient-to-br from-white to-[#DFF7F3] border border-[#CDEBE7] rounded-lg p-6 mb-6 shadow-[0_18px_45px_rgba(11,55,96,0.08)]">

<img
src="/logo.png"
alt=""
aria-hidden="true"
className="absolute -right-8 -bottom-12 w-44 h-44 object-contain opacity-[0.10] pointer-events-none"
/>

<div className="relative">

<div className="w-fit bg-white text-[#0F8F83] border border-[#DCEDEA] rounded-full px-3 py-2 text-xs font-bold mb-5">
{plannedCount} planned
</div>

<h1 className="text-3xl font-black leading-tight tracking-normal mb-2">
Future Reading
</h1>

<p className="text-sm text-slate-600 leading-6 max-w-[260px]">
Save papers, links, and ideas before they disappear from your mental waiting room.
</p>

</div>

</div>

<div className="bg-white/90 border border-[#DCEDEA] rounded-lg p-5 mb-6 shadow-[0_14px_35px_rgba(11,55,96,0.07)]">

<div className="flex items-start gap-3 mb-5">

<div className="bg-[#E8F8F5] text-[#0B3760] rounded-lg p-3">
<BookmarkPlus size={20}/>
</div>

<div>
<h2 className="font-black text-lg text-[#113247]">
Add Reading
</h2>
<p className="text-sm text-slate-500">
Store useful articles, topics, and CPD links.
</p>
</div>

</div>

<input
className={fieldClass}
placeholder="Title or topic"
value={form.title}
onChange={(e)=>updateForm("title",e.target.value)}
/>

<input
className={fieldClass}
placeholder="Link or URL"
value={form.url}
onChange={(e)=>updateForm("url",e.target.value)}
/>

<div className="grid grid-cols-2 gap-3">
<select
className={fieldClass}
value={form.category}
onChange={(e)=>updateForm("category",e.target.value)}
>
{categories.map(category=>(
<option key={category}>{category}</option>
))}
</select>

<select
className={fieldClass}
value={form.priority}
onChange={(e)=>updateForm("priority",e.target.value)}
>
{priorities.map(priority=>(
<option key={priority}>{priority}</option>
))}
</select>
</div>

<input
className={fieldClass}
type="date"
value={form.due_date}
onChange={(e)=>updateForm("due_date",e.target.value)}
/>

<textarea
rows="3"
className={fieldClass}
placeholder="Why this is worth reading, or what question it answers..."
value={form.notes}
onChange={(e)=>updateForm("notes",e.target.value)}
/>

<button
className="w-full bg-[#71CFC2] text-[#062F63] rounded-lg p-4 font-black shadow-[0_12px_24px_rgba(15,143,131,0.16)] disabled:opacity-50 flex items-center justify-center gap-2"
onClick={addItem}
disabled={saving}
>
{saving?(
<>
<Loader2 size={18} className="animate-spin"/>
Saving...
</>
):(
<>
<BookmarkPlus size={18}/>
Add to List
</>
)}
</button>

</div>

<div className="space-y-3">

{loading&&(
<div className="bg-white/80 border border-[#DCEDEA] rounded-lg p-5 text-sm text-slate-500 flex items-center gap-2">
<Loader2 size={18} className="animate-spin"/>
Loading future reading...
</div>
)}

{!loading&&items.length===0&&(
<div className="bg-white/80 border border-[#DCEDEA] rounded-lg p-5 text-sm text-slate-500">
No future reading saved yet.
</div>
)}

{items.map(item=>(

<div
key={item.id}
className={`bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_10px_24px_rgba(11,55,96,0.06)] ${item.status==="done"?"opacity-60":""}`}
>

<div className="flex justify-between gap-3">

<div>
<div className="font-black text-[#113247] leading-snug">
{item.title}
</div>

<div className="flex flex-wrap gap-2 mt-2">
<span className="bg-[#E8F8F5] text-[#0B3760] rounded-full px-3 py-1 text-xs font-bold">
{item.category}
</span>
<span className="bg-white border border-[#DCEDEA] text-slate-600 rounded-full px-3 py-1 text-xs font-bold">
{item.priority}
</span>
{item.due_date&&(
<span className="bg-white border border-[#DCEDEA] text-slate-600 rounded-full px-3 py-1 text-xs font-bold flex items-center gap-1">
<CalendarDays size={13}/>
{new Date(item.due_date).toLocaleDateString()}
</span>
)}
</div>
</div>

<button
onClick={()=>markDone(item)}
className={`h-10 w-10 shrink-0 rounded-full grid place-items-center ${item.status==="done"?"bg-[#0F8F83] text-white":"bg-[#E8F8F5] text-[#0B3760]"}`}
>
{busyId===item.id?<Loader2 size={17} className="animate-spin"/>:<Check size={17}/>} 
</button>

</div>

{item.notes&&(
<p className="text-sm text-slate-600 leading-6 mt-3">
{item.notes}
</p>
)}

<div className="flex justify-end gap-3 mt-4">

{item.url&&(
<a
href={item.url}
target="_blank"
rel="noreferrer"
className="text-[#0B3760] bg-[#E8F8F5] rounded-lg px-3 py-2 text-sm font-bold flex items-center gap-2"
>
<ExternalLink size={16}/>
Open
</a>
)}

<button
onClick={()=>deleteItem(item.id)}
className="text-slate-500 bg-slate-100 rounded-lg px-3 py-2 text-sm font-bold flex items-center gap-2"
>
{busyId===item.id?<Loader2 size={16} className="animate-spin"/>:<Trash2 size={16}/>} 
Remove
</button>

</div>

</div>

))}

</div>

</div>

)

}