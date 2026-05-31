import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const loadImageAsDataUrl=async(src)=>{
  const response=await fetch(src)
  const blob=await response.blob()

  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onloadend=()=>resolve(reader.result)
    reader.onerror=reject
    reader.readAsDataURL(blob)
  })
}

const formatDate=(value)=>{
  if(!value) return ""
  return new Date(value).toLocaleDateString()
}

export const exportCPD=async(history)=>{

const doc=new jsPDF({
  orientation:"portrait",
  unit:"mm",
  format:"a4"
})

let logo=null

try{
  logo=await loadImageAsDataUrl("/logo.png")
}catch(error){
  console.log("Logo export error:",error)
}

const pageWidth=doc.internal.pageSize.getWidth()
const pageHeight=doc.internal.pageSize.getHeight()
const navy=[11,55,96]
const teal=[113,207,194]
const muted=[100,116,139]
const pale=[232,248,245]

if(logo){
  doc.addImage(logo,"PNG",14,12,18,18)
}

doc.setTextColor(...navy)
doc.setFont("helvetica","bold")
doc.setFontSize(19)
doc.text("VetLearn CPD Log",logo?36:14,20)

doc.setTextColor(...muted)
doc.setFont("helvetica","normal")
doc.setFontSize(9)
doc.text(`Generated ${new Date().toLocaleDateString()}`,logo?36:14,26)

doc.setDrawColor(...teal)
doc.setLineWidth(0.8)
doc.line(14,34,pageWidth-14,34)

const totalMinutes=history.reduce((sum,item)=>sum+(item.duration_minutes||0),0)
const totalHours=(totalMinutes/60).toFixed(1)

autoTable(doc,{
  startY:40,
  theme:"plain",
  margin:{left:14,right:14},
  body:[[
    `${history.length}`,
    "entries",
    `${totalHours}`,
    "hours"
  ]],
  styles:{
    font:"helvetica",
    fontSize:10,
    cellPadding:{top:2,bottom:2,left:1,right:1},
    textColor:navy
  },
  columnStyles:{
    0:{fontStyle:"bold",fontSize:18,cellWidth:18},
    1:{textColor:muted,cellWidth:32},
    2:{fontStyle:"bold",fontSize:18,cellWidth:22},
    3:{textColor:muted}
  }
})

autoTable(doc,{

startY:58,

theme:"grid",

head:[[
"Date",
"Title",
"Category",
"Time",
"URL",
"Reflection"
]],

body:history.map(item=>([

formatDate(item.created_at||item.finished_at),

item.title||"",

item.category||"",

`${item.duration_minutes||0} min`,

item.article_url||"",

item.user_reflection||item.reflection||""

])),

styles:{
  font:"helvetica",
  fontSize:8,
  cellPadding:2.2,
  lineColor:[220,237,234],
  lineWidth:0.2,
  textColor:[17,50,71],
  valign:"top"
},

headStyles:{
  fillColor:teal,
  textColor:navy,
  fontStyle:"bold",
  lineColor:teal
},

alternateRowStyles:{
  fillColor:[249,252,251]
},

columnStyles:{
  0:{cellWidth:19},
  1:{cellWidth:38,fontStyle:"bold"},
  2:{cellWidth:24},
  3:{cellWidth:16},
  4:{cellWidth:38,textColor:[15,143,131]},
  5:{cellWidth:"auto"}
},

didDrawPage:()=>{
  doc.setDrawColor(...pale)
  doc.setLineWidth(0.5)
  doc.line(14,pageHeight-16,pageWidth-14,pageHeight-16)
  doc.setTextColor(...muted)
  doc.setFontSize(8)
  doc.text("VetLearn CPD Tracker",14,pageHeight-10)
  doc.text(`Page ${doc.internal.getNumberOfPages()}`,pageWidth-28,pageHeight-10)
}

})

doc.save(
"VetLearn-CPD-Log.pdf"
)

}