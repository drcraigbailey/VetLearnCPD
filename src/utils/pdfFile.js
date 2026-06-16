import { Capacitor } from "@capacitor/core"
import { Directory, Filesystem } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"

const pdfToBase64 = (doc) => {
  const dataUri = doc.output("datauristring")
  return dataUri.includes(",") ? dataUri.split(",")[1] : dataUri
}

const openBrowserPdfForPrinting = (doc, filename) => {
  try {
    if (typeof doc.autoPrint === "function") {
      doc.autoPrint({ variant: "non-conform" })
    }

    const pdfBlob = doc.output("blob")
    const pdfUrl = URL.createObjectURL(pdfBlob)
    const printWindow = window.open(pdfUrl, "_blank", "noopener,noreferrer")

    if (!printWindow) {
      URL.revokeObjectURL(pdfUrl)
      doc.save(filename)
      return false
    }

    const cleanup = () => window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000)
    printWindow.addEventListener?.("load", () => {
      cleanup()
      printWindow.focus?.()
      printWindow.print?.()
    })
    cleanup()
    return true
  } catch (error) {
    console.error("PDF print error:", error)
    doc.save(filename)
    return false
  }
}

export const saveOrSharePdf = async (
  doc,
  filename,
  {
    title = "VetLearn PDF",
    text = "PDF exported from VetLearn.",
    dialogTitle = "Save, share or print PDF",
    print = false,
  } = {}
) => {
  if (Capacitor.isNativePlatform()) {
    const result = await Filesystem.writeFile({
      path: filename,
      data: pdfToBase64(doc),
      directory: Directory.Cache,
      recursive: true,
    })

    await Share.share({
      title,
      text,
      url: result.uri,
      dialogTitle,
    })

    return true
  }

  if (print) {
    return openBrowserPdfForPrinting(doc, filename)
  }

  doc.save(filename)
  return true
}
