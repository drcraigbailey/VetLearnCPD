import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export const exportCPD=(history)=>{

const doc=new jsPDF()

doc.setFontSize(18)

doc.text(
"Veterinary CPD Log",
14,
20
)

autoTable(doc,{

head:[[
"Date",
"Title",
"Category",
"Time",
"Reflection"
]],

body:history.map(item=>([

new Date(
item.created_at
).toLocaleDateString(),

item.title,

item.category,

`${item.duration_minutes} min`,

item.reflection

]))

})

doc.save(
"CPD-Reading-Log.pdf"
)

}