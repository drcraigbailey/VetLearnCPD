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

export const exportCaseLogs = async (cases) => {
  if (!cases || cases.length === 0) return;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  let logo = null
  try {
    logo = await loadImageAsDataUrl(logoImage)
  } catch (error) {
    console.log("Logo export error:", error)
  }

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const navy = [11, 55, 96]
  const teal = [113, 207, 194]
  const muted = [100, 116, 139]

  if (logo) {
    doc.addImage(logo, "PNG", 14, 12, 18, 18)
  }

  doc.setTextColor(...navy)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(19)
  doc.text("Clinical Case Reports", logo ? 36 : 14, 20)

  doc.setTextColor(...muted)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(
    `Generated ${new Date().toLocaleDateString()} | ${cases.length} cases`,
    logo ? 36 : 14,
    26
  )

  doc.setDrawColor(...teal)
  doc.setLineWidth(0.8)
  doc.line(14, 34, pageWidth - 14, 34)

  let startY = 44;

  cases.forEach((c, index) => {
    // Add page break if not enough space for title
    if (startY > pageHeight - 40) {
      doc.addPage();
      startY = 20;
    }

    doc.setTextColor(...navy)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(14)
    doc.text(c.title || "Untitled Case", 14, startY)
    
    doc.setFontSize(10)
    doc.setTextColor(...muted)
    doc.text(`Date: ${new Date(c.created_at).toLocaleDateString()}  |  Category: ${c.category || 'N/A'}`, 14, startY + 6)

    // Patient Details Table
    const patientData = [
      ["Patient Name", c.patient_name || "-"],
      ["Species", c.species || "-"],
      ["Breed", c.breed || "-"],
      ["Age / Gender", `${c.age || "-"} / ${c.gender || "-"}`]
    ];

    autoTable(doc, {
      startY: startY + 10,
      theme: "grid",
      body: patientData,
      styles: { fontSize: 9, cellPadding: 2, textColor: [17, 50, 71] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 40, fillColor: [232, 248, 245] } },
      margin: { left: 14, right: 14 }
    });

    // Description text
    if (c.description) {
      doc.setFont("helvetica", "bold");
      doc.text("Clinical Notes:", 14, doc.lastAutoTable.finalY + 8);
      doc.setFont("helvetica", "normal");
      
      const splitText = doc.splitTextToSize(c.description, pageWidth - 28);
      doc.text(splitText, 14, doc.lastAutoTable.finalY + 14);
      
      startY = doc.lastAutoTable.finalY + 18 + (splitText.length * 4);
    } else {
      startY = doc.lastAutoTable.finalY + 10;
    }

    // Attachments summary
    if (c.media_urls && c.media_urls.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text(`* Case includes ${c.media_urls.length} attached files/media.`, 14, startY);
      startY += 10;
    }

    // Divider between cases
    if (index < cases.length - 1) {
      doc.setDrawColor(220, 237, 234);
      doc.setLineWidth(0.5);
      doc.line(14, startY + 5, pageWidth - 14, startY + 5);
      startY += 15;
    }
  });

  doc.save("VetLearn-Case-Reports.pdf")
}