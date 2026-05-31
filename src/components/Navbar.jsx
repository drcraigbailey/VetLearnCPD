import { NavLink } from "react-router-dom";

import {
  House,
  BookmarkPlus,
  History,
  BarChart3,
  Settings
} from "lucide-react";

export default function Navbar({darkMode=false}){

  const items=[
    { icon:<House size={18}/>, label:"Home", path:"/" },
    { icon:<BookmarkPlus size={18}/>, label:"Future", path:"/future" },
    { icon:<History size={18}/>, label:"History", path:"/history" },
    { icon:<BarChart3 size={18}/>, label:"Stats", path:"/analytics" },
    { icon:<Settings size={18}/>, label:"Settings", path:"/settings" }
  ]

  return(
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-4">
      <div className={`w-full max-w-md backdrop-blur-xl border rounded-full p-2 flex justify-around ${darkMode?"bg-[#071A24]/90 border-white/10 shadow-[0_14px_32px_rgba(0,0,0,0.28)]":"bg-white/90 border-[#DCEDEA] shadow-[0_14px_32px_rgba(11,55,96,0.14)]"}`}>
        {items.map(item=>(
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path==="/"}
            className={({isActive})=>
              `flex flex-col items-center justify-center min-w-16 h-12 rounded-full transition text-xs font-bold ${isActive?"bg-[#71CFC2] text-[#062F63]":darkMode?"text-slate-300":"text-slate-500"}`
            }
          >
            {item.icon}
            <div>{item.label}</div>
          </NavLink>
        ))}
      </div>
    </div>
  )
}