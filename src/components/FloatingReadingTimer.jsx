import { useEffect, useState } from "react";
import { Check, GripHorizontal, X } from "lucide-react";

const formatElapsed=(startedAt)=>{
  if(!startedAt) return "0:00"

  const seconds=Math.max(0,Math.floor((Date.now()-new Date(startedAt).getTime())/1000))
  const minutes=Math.floor(seconds/60)
  const remainingSeconds=seconds%60

  return `${minutes}:${String(remainingSeconds).padStart(2,"0")}`
}

export default function FloatingReadingTimer({session,onFinish,onCancel,darkMode=false}){
  const [elapsed,setElapsed]=useState(()=>formatElapsed(session?.started_at))
  const [position,setPosition]=useState(()=>{
    const saved=localStorage.getItem("vetlearn-timer-position")
    return saved?JSON.parse(saved):{x:18,y:110}
  })
  const [dragging,setDragging]=useState(false)
  const [dragOffset,setDragOffset]=useState({x:0,y:0})

  useEffect(()=>{
    if(!session) return

    setElapsed(formatElapsed(session.started_at))

    const interval=setInterval(()=>{
      setElapsed(formatElapsed(session.started_at))
    },1000)

    return ()=>clearInterval(interval)
  },[session])

  useEffect(()=>{
    localStorage.setItem("vetlearn-timer-position",JSON.stringify(position))
  },[position])

  if(!session) return null

  const startDrag=(event)=>{
    const pointer=event.touches?.[0]||event
    setDragging(true)
    setDragOffset({
      x:pointer.clientX-position.x,
      y:pointer.clientY-position.y
    })
  }

  const moveDrag=(event)=>{
    if(!dragging) return

    const pointer=event.touches?.[0]||event
    const nextX=Math.min(Math.max(8,pointer.clientX-dragOffset.x),window.innerWidth-230)
    const nextY=Math.min(Math.max(8,pointer.clientY-dragOffset.y),window.innerHeight-120)

    setPosition({x:nextX,y:nextY})
  }

  const stopDrag=()=>setDragging(false)

  return(
    <div
      className={`fixed z-[80] w-[222px] rounded-2xl border p-3 shadow-2xl backdrop-blur-xl ${darkMode?"bg-[#071A24]/95 border-white/10 text-white":"bg-white/95 border-[#DCEDEA] text-[#113247]"}`}
      style={{left:position.x,top:position.y,touchAction:"none"}}
      onMouseMove={moveDrag}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onTouchMove={moveDrag}
      onTouchEnd={stopDrag}
    >
      <button
        className={`mb-2 flex w-full cursor-move items-center justify-center rounded-xl py-1 ${darkMode?"bg-white/10 text-slate-300":"bg-[#F0F6F5] text-slate-500"}`}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        aria-label="Move timer"
      >
        <GripHorizontal size={18}/>
      </button>

      <div className="text-xs font-bold text-[#0F8F83]">
        Reading now
      </div>

      <div className="mt-1 truncate text-sm font-black">
        {session.title||"Untitled reading"}
      </div>

      <div className="mt-2 text-3xl font-black text-[#71CFC2]">
        {elapsed}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button
          className="flex items-center justify-center gap-2 rounded-xl bg-[#71CFC2] px-3 py-3 text-sm font-black text-[#062F63]"
          onClick={onFinish}
        >
          <Check size={16}/>
          Finish
        </button>

        <button
          className={`rounded-xl px-3 py-3 ${darkMode?"bg-white/10 text-slate-300":"bg-slate-100 text-slate-500"}`}
          onClick={onCancel}
          aria-label="Cancel reading session"
        >
          <X size={16}/>
        </button>
      </div>
    </div>
  )
}
