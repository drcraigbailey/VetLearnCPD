import { Capacitor } from "@capacitor/core"
import { Directory, Filesystem } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"
import toast from "react-hot-toast"

export const isCapacitorAndroid = () =>
  Capacitor.isNativePlatform?.() && Capacitor.getPlatform?.() === "android"

const cleanPdfFilename = (filename = "VetLearn-PDF.pdf") => {
  const safeName = String(filename)
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onloadend = () => {
    const result = String(reader.result || "")
    resolve(result.includes(",") ? result.split(",")[1] : result)
  }
  reader.onerror = reject
  reader.readAsDataURL(blob)
})

const pdfToBase64 = async (pdfSource) => {
  if (pdfSource instanceof Blob) return blobToBase64(pdfSource)
  if (typeof pdfSource === "string") {
    return pdfSource.includes(",") ? pdfSource.split(",")[1] : pdfSource
  }
  if (pdfSource?.output) {
    const dataUri = pdfSource.output("datauristring")
    return dataUri.includes(",") ? dataUri.split(",")[1] : dataUri
  }
  throw new Error("Unsupported PDF source")
}

const pdfToBlob = (pdfSource) => {
  if (pdfSource instanceof Blob) return pdfSource
  if (pdfSource?.output) return pdfSource.output("blob")
  throw new Error("Unsupported PDF source")
}

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}

const saveDocDirectly = (pdfSource, filename) => {
  if (pdfSource?.save) {
    pdfSource.save(filename)
    return
  }
  downloadBlob(pdfToBlob(pdfSource), filename)
}

const addPrintHint = (pdfSource) => {
  if (typeof pdfSource?.autoPrint === "function") {
    pdfSource.autoPrint({ variant: "non-conform" })
  }
}

const openBrowserPdfForPrinting = (pdfSource, filename) => {
  try {
    addPrintHint(pdfSource)
    const pdfBlob = pdfToBlob(pdfSource)
    const pdfUrl = URL.createObjectURL(pdfBlob)
    const printWindow = window.open(pdfUrl, "_blank", "noopener,noreferrer")

    if (!printWindow) {
      URL.revokeObjectURL(pdfUrl)
      saveDocDirectly(pdfSource, filename)
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
    saveDocDirectly(pdfSource, filename)
    return false
  }
}

const shareNativePdf = async (pdfSource, filename, options) => {
  const result = await Filesystem.writeFile({
    path: `vetlearn-pdfs/${filename}`,
    data: await pdfToBase64(pdfSource),
    directory: Directory.Cache,
    recursive: true,
  })

  const canShare = await Share.canShare().catch(() => ({ value: false }))
  if (!canShare.value) {
    throw new Error("Native sharing is not available on this device")
  }

  await Share.share({
    title: options.title,
    text: options.text,
    url: result.uri,
    files: [result.uri],
    dialogTitle: options.dialogTitle,
  })

  return result.uri
}

export const saveOrSharePdf = async (
  pdfSource,
  filename,
  {
    title = "VetLearn PDF",
    text = "PDF exported from VetLearn.",
    dialogTitle = "Save, share or print PDF",
    print = false,
    successMessage,
    errorMessage,
  } = {}
) => {
  const safeFilename = cleanPdfFilename(filename)

  try {
    if (Capacitor.isNativePlatform?.()) {
      await shareNativePdf(pdfSource, safeFilename, {
        title,
        text: print ? "PDF ready to print, save or share from VetLearn." : text,
        dialogTitle,
      })
      toast.success(successMessage || (print ? "PDF ready to print" : "PDF saved"))
      return true
    }

    if (print) {
      const opened = openBrowserPdfForPrinting(pdfSource, safeFilename)
      toast.success(opened ? "PDF ready to print" : "PDF downloaded")
      return opened
    }

    saveDocDirectly(pdfSource, safeFilename)
    toast.success(successMessage || "PDF downloaded")
    return true
  } catch (error) {
    console.error("Unable to generate or open PDF:", error)
    toast.error(errorMessage || (print ? "Unable to open PDF on this device" : "Unable to generate PDF"))
    return false
  }
}

export const handlePdfDownloadOrShare = (pdfSource, filename, options = {}) =>
  saveOrSharePdf(pdfSource, filename, { ...options, print: false })

export const handlePdfPrint = (pdfSource, filename, options = {}) =>
  saveOrSharePdf(pdfSource, filename, { ...options, print: true })
