import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import logoImage from "../assets/icon.png"

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
  if (!history || history.length === 0) return;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  let logo = null
  try { logo = await loadImageAsDataUrl(logoImage) } catch (e) {}

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

  let startY = 42;

  history.forEach((record, index) => {
    if (startY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      startY = 20;
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
    ]);

    autoTable(doc, {
      startY: startY + 8,
      theme: "grid",
      head: [["Drug", "Dose Used", "Conc.", "Total mg", "Total ml"]],
      body: tableData,
      styles: { fontSize: 9, cellPadding: 2, textColor: [17, 50, 71] },
      headStyles: { fillColor: [113, 207, 194], textColor: [11, 55, 96] },
      margin: { left: 14, right: 14 }
    });

    startY = doc.lastAutoTable.finalY + 12;
  });

  doc.save("VetLearn-Drug-History.pdf")
}