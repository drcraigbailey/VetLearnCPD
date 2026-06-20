import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { formatClinicalItemText, getClinicalItemBody } from "./clinicalItemText"
import { saveOrSharePdf } from "./pdfFile"

const logoImage = "/logo.png"

const loadImageAsDataUrl = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL("image/png"))
    }
    img.onerror = reject
    img.src = src
  })
}

export const exportDrugHistory = async (history) => {
  if (!history || history.length === 0) return false

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  let logo = null
  try {
    logo = await loadImageAsDataUrl(logoImage)
  } catch (error) {
    console.log("Logo export error:", error)
  }

  const pageWidth = doc.internal.pageSize.getWidth()
  const navy = [11, 55, 96]
  const teal = [113, 207, 194]
  const muted = [100, 116, 139]

  if (logo) doc.addImage(logo, "PNG", 14, 12, 18, 18)

  doc.setTextColor(...navy)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(19)
  doc.text("Drug Calculation History (24h)", logo ? 36 : 14, 20)

  doc.setTextColor(...muted)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`Generated ${new Date().toLocaleDateString()} | ${history.length} patients`, logo ? 36 : 14, 26)

  doc.setDrawColor(...teal)
  doc.setLineWidth(0.8)
  doc.line(14, 34, pageWidth - 14, 34)

  let startY = 42

  history.forEach((record) => {
    if (startY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      startY = 20
    }

    doc.setTextColor(...navy)
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text(`Patient: ${record.patientName || "Unnamed"} (${record.species}, ${record.weight}kg)`, 14, startY)
    
    doc.setFontSize(9)
    doc.setTextColor(...muted)
    doc.setFont("helvetica", "normal")
    doc.text(`Calculated on: ${new Date(record.timestamp).toLocaleString()}`, 14, startY + 5)

    const tableData = record.calculatedDrugs.map(d => [
      d.name,
      `${d.selectedDose} mg/kg`,
      d.concentration ? `${d.concentration} mg/ml` : "N/A",
      `${d.totalMg} mg`,
      d.totalMl ? `${d.totalMl} ml` : "N/A"
    ])

    autoTable(doc, {
      startY: startY + 8,
      theme: "grid",
      head: [["Drug", "Dose Used", "Conc.", "Total mg", "Total ml"]],
      body: tableData,
      styles: { fontSize: 9, cellPadding: 2, textColor: [17, 50, 71] },
      headStyles: { fillColor: [113, 207, 194], textColor: [11, 55, 96] },
      margin: { left: 14, right: 14 }
    })

    startY = doc.lastAutoTable.finalY + 12
  })

  return saveOrSharePdf(doc, "VetLearn-Drug-History.pdf", {
    title: "VetLearn Drug History",
    text: "Your VetLearn drug calculation history PDF is ready.",
  })
}

const valueText = (value) => {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ")
  if (typeof value === "object") return getClinicalItemBody(value)
  return String(value).trim()
}

const listText = (items) => (items || [])
  .map(formatClinicalItemText)
  .filter(Boolean)

const addFooter = (doc, pageWidth, pageHeight, muted) => {
  const pageCount = doc.internal.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(232, 248, 245)
    doc.setLineWidth(0.5)
    doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16)
    doc.setTextColor(...muted)
    doc.setFontSize(8)
    doc.text("VetLearnCPD", 14, pageHeight - 10)
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 34, pageHeight - 10)
  }
}

const addSection = (doc, title, body, startY, colours) => {
  const rows = Array.isArray(body) ? body.filter(Boolean).map((line) => [line]) : [[body]]
  if (rows.length === 0 || rows.every(([line]) => !String(line || "").trim())) return startY

  autoTable(doc, {
    startY,
    theme: "grid",
    head: [[title]],
    body: rows,
    margin: { left: 14, right: 14 },
    pageBreak: "auto",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.4,
      lineColor: [220, 237, 234],
      lineWidth: 0.2,
      textColor: [17, 50, 71],
      valign: "top",
    },
    headStyles: {
      fillColor: colours.teal,
      textColor: colours.navy,
      fontStyle: "bold",
      lineColor: colours.teal,
    },
    alternateRowStyles: {
      fillColor: [249, 252, 251],
    },
  })

  return doc.lastAutoTable.finalY + 7
}

const buildDoseRows = (doses = []) => doses
  .filter(Boolean)
  .map((dose) => [
    dose.species || "Unspecified",
    dose.route || "Unspecified",
    [dose.dose_min, dose.dose_max && dose.dose_max !== dose.dose_min ? dose.dose_max : ""].filter(Boolean).join(" - ") || "-",
    dose.dose_unit || "mg/kg",
    dose.concentration ? `${dose.concentration} mg/ml` : "",
    dose.notes || "",
  ])

const safeDrugFilename = (name) => String(name || "Drug")
  .trim()
  .replace(/[^\w\s-]/g, "")
  .replace(/\s+/g, "-")

export const generateDrugMonographPdf = async ({
  drugName,
  drug,
  doses = [],
  summary = {},
  noteText = "",
  print = true,
} = {}) => {
  const name = drugName || drug?.name || "Drug Monograph"
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  let logo = null
  try {
    logo = await loadImageAsDataUrl(logoImage)
  } catch (error) {
    console.log("Logo export error:", error)
  }

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const colours = {
    navy: [11, 55, 96],
    teal: [113, 207, 194],
    muted: [100, 116, 139],
  }

  if (logo) doc.addImage(logo, "PNG", 14, 12, 18, 18)
  doc.setTextColor(...colours.navy)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text("VetLearnCPD", logo ? 36 : 14, 17)
  doc.setFontSize(22)
  doc.text(name, logo ? 36 : 14, 27)
  doc.setTextColor(...colours.muted)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`Generated ${new Date().toLocaleDateString()}`, 14, 39)
  doc.setDrawColor(...colours.teal)
  doc.setLineWidth(0.8)
  doc.line(14, 45, pageWidth - 14, 45)

  let startY = 52
  const aliases = [...new Set([...(drug?.aliases || []), ...(summary?.aliases || []).map((item) => item.alias || item.name)].filter(Boolean))]
  const brandNames = [...new Set([...(drug?.brandNames || []), ...(summary?.aliases || []).filter((item) => item.is_trade_name || item.type === "brand").map((item) => item.alias || item.name)].filter(Boolean))]

  const overviewRows = [
    ["Drug class", drug?.category || drug?.drug_class || ""],
    ["Species guidance", [...new Set((doses || []).map((dose) => dose.species).filter(Boolean))].join(", ")],
    ["Indications", drug?.indication || drug?.indications || ""],
    ["Aliases", aliases.join(", ")],
    ["Brand names", brandNames.join(", ")],
  ].filter(([, value]) => valueText(value))

  if (overviewRows.length > 0) {
    autoTable(doc, {
      startY,
      theme: "grid",
      head: [["Field", "Details"]],
      body: overviewRows,
      margin: { left: 14, right: 14 },
      rowPageBreak: "avoid",
      styles: { fontSize: 9, cellPadding: 2.4, textColor: [17, 50, 71], lineColor: [220, 237, 234], lineWidth: 0.2, valign: "top" },
      headStyles: { fillColor: colours.teal, textColor: colours.navy, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 38, fontStyle: "bold", fillColor: [232, 248, 245] } },
    })
    startY = doc.lastAutoTable.finalY + 7
  }

  const doseRows = buildDoseRows(doses)
  if (doseRows.length > 0) {
    autoTable(doc, {
      startY,
      theme: "grid",
      head: [["Species", "Route", "Dose", "Unit", "Concentration", "Notes"]],
      body: doseRows,
      margin: { left: 14, right: 14 },
      pageBreak: "auto",
      rowPageBreak: "avoid",
      styles: { fontSize: 8, cellPadding: 2, textColor: [17, 50, 71], lineColor: [220, 237, 234], lineWidth: 0.2, valign: "top" },
      headStyles: { fillColor: colours.teal, textColor: colours.navy, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { cellWidth: 22, fontStyle: "bold" },
        3: { cellWidth: 18 },
        4: { cellWidth: 28 },
        5: { cellWidth: "auto" },
      },
    })
    startY = doc.lastAutoTable.finalY + 7
  }

  const summaryItems = listText([...(summary?.clinicalPearls || []), ...(summary?.drugInformation || [])])
  startY = addSection(doc, "Clinical Summary", summaryItems.length ? summaryItems : drug?.summary || drug?.description || "", startY, colours)
  startY = addSection(doc, "Contraindications", listText(summary?.contraindications), startY, colours)
  startY = addSection(doc, "Adverse Effects", listText(summary?.adverseEffects), startY, colours)
  startY = addSection(doc, "Monitoring Recommendations", listText(summary?.monitoring), startY, colours)
  startY = addSection(doc, "Drug Interactions", listText(summary?.interactions), startY, colours)
  startY = addSection(doc, "Species Warnings", listText(summary?.speciesWarnings), startY, colours)
  startY = addSection(doc, "General Warnings", listText(summary?.warnings), startY, colours)
  addSection(doc, "User Notes", noteText, startY, colours)

  addFooter(doc, pageWidth, pageHeight, colours.muted)

  return saveOrSharePdf(doc, `VetLearnCPD-${safeDrugFilename(name)}-Monograph.pdf`, {
    title: `${name} monograph`,
    text: `Your VetLearnCPD ${name} monograph PDF is ready.`,
    dialogTitle: "Print, save or share monograph PDF",
    print,
    successMessage: print ? "PDF ready to print" : "PDF saved",
  })
}

export const exportDrugMonograph = generateDrugMonographPdf
