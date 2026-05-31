import { NavLink } from "react-router-dom";

import {

House,
History,
BarChart3

}

from "lucide-react";

export default function Navbar(){

const items=[

{
icon:<House size={18}/>,
label:"Home",
path:"/"
},

{
icon:<History size={18}/>,
label:"History",
path:"/history"
},

{
icon:<BarChart3 size={18}/>,
label:"Analytics",
path:"/analytics"
}

]

return(

<div
className="
fixed
top-0
left-0
right-0
z-50
flex
justify-center
pt-3
"
>

<div
className="
w-full
max-w-md
mx-3
bg-white/90
backdrop-blur
rounded-3xl
shadow-sm
p-2
flex
justify-around
"
>

{items.map(item=>(

<NavLink

key={item.path}

to={item.path}

className={({isActive})=>

`flex flex-col items-center p-2 rounded-2xl transition

${
isActive
?
"bg-[#71CFC2] text-[#062F63]"
:
"text-slate-500"
}`

}

>

{item.icon}

<div
className="text-xs"
>

{item.label}

</div>

</NavLink>

))}

</div>

</div>

)

}