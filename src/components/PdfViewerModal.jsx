import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, Minus, Plus, Printer, X } from "lucide-react";
import toast from "react-hot-toast";
import { handlePdfDownloadOrShare, handlePdfExternalOpen, handlePdfPrint } from "../utils/pdfFile";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const pdfDocumentOptions = {
  standardFontDataUrl: "/standard_fonts/",
  useSystemFonts: true,
  useWorkerFetch: false,
  useWasm: false,
  disableRange: true,
  disableStream: true,
  disableAutoFetch: true,
  isOffscreenCanvasSupported: false,
  isImageDecoderSupported: false,
  stopAtErrors: false
};

const stringToPdfBlob = async (source) => {
  if (source.startsWith("data:")) {
    const response = await fetch(source);
    return response.blob();
  }

  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`PDF fetch failed with status ${response.status}`);
  }
  return response.blob();
};

const sourceToBlob = async (source) => {
  if (source instanceof Blob) return source;
  if (source?.output) return source.output("blob");
  if (typeof source === "string") return stringToPdfBlob(source);
  return null;
};

const createViewerFile = async (source) => {
  if (!source) return null;

  const blob = await sourceToBlob(source);
  if (!blob) return null;
  const data = new Uint8Array(await blob.arrayBuffer());
  return { data };
};

export default function PdfViewerModal({ viewer, darkMode, onClose }) {
  const [file, setFile] = useState(null);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? 390 : window.innerWidth));
  const canvasRef = useRef(null);

  const source = viewer?.source;
  const filename = viewer?.filename || "VetLearn-PDF.pdf";
  const title = viewer?.title || "VetLearn PDF";
  const sourceOptions = viewer?.options || {};
  const pageWidth = Math.max(280, Math.min(viewportWidth - 24, 820));

  useEffect(() => {
    if (!source) return undefined;
    let active = true;

    setLoading(true);
    setError("");
    setFile(null);
    setPdfDocument(null);
    setPageCount(0);
    setPageNumber(1);
    setScale(1);

    // Source may be a Supabase signed URL, a blob URL, a Blob, or a generated jsPDF document.
    // Generated/blob PDFs are converted to in-memory bytes so Android WebView does not need to fetch a blob URL.
    createViewerFile(source)
      .then((nextFile) => {
        if (!active) return;
        setFile(nextFile);
        if (!nextFile) {
          setLoading(false);
          setError("This PDF could not be opened in the app.");
        }
      })
      .catch((loadError) => {
        console.error("PDF viewer source error:", loadError);
        if (!active) return;
        setFile(null);
        setLoading(false);
        setError("This PDF could not be opened in the app.");
      });

    return () => {
      active = false;
    };
  }, [source]);

  useEffect(() => {
    if (!file) return undefined;
    let active = true;
    const loadParams = typeof file === "string" ? { url: file } : file;
    const loadingTask = pdfjs.getDocument({ ...loadParams, ...pdfDocumentOptions });

    setLoading(true);
    setError("");

    loadingTask.promise
      .then((document) => {
        if (!active) {
          document.destroy?.();
          return;
        }
        setPdfDocument(document);
        setPageCount(document.numPages || 0);
        setPageNumber((page) => Math.min(Math.max(page, 1), document.numPages || 1));
      })
      .catch((loadError) => {
        console.error("PDF document load error:", loadError);
        if (!active) return;
        setPdfDocument(null);
        setPageCount(0);
        setLoading(false);
        setError("Unable to open this PDF.");
      });

    return () => {
      active = false;
      loadingTask.destroy?.();
    };
  }, [file]);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return undefined;
    let active = true;
    let renderTask = null;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { alpha: false });

    setLoading(true);
    setError("");

    pdfDocument.getPage(pageNumber)
      .then((page) => {
        if (!active) return null;
        const baseViewport = page.getViewport({ scale: 1 });
        const renderScale = (pageWidth / baseViewport.width) * scale;
        const viewport = page.getViewport({ scale: renderScale });
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, viewport.width, viewport.height);

        renderTask = page.render({ canvasContext: context, viewport });
        return renderTask.promise;
      })
      .then(() => {
        if (!active) return;
        setLoading(false);
        setError("");
      })
      .catch((renderError) => {
        if (renderError?.name === "RenderingCancelledException") return;
        console.error("PDF page render error:", renderError);
        if (!active) return;
        setLoading(false);
        setError("Unable to open this PDF.");
      });

    return () => {
      active = false;
      renderTask?.cancel?.();
    };
  }, [pdfDocument, pageNumber, pageWidth, scale]);

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  if (!viewer) return null;

  const goToPrevious = () => setPageNumber((page) => Math.max(1, page - 1));
  const goToNext = () => setPageNumber((page) => Math.min(pageCount || page, page + 1));
  const zoomOut = () => setScale((value) => Math.max(0.7, Number((value - 0.15).toFixed(2))));
  const zoomIn = () => setScale((value) => Math.min(2.2, Number((value + 0.15).toFixed(2))));

  const openExternal = async () => {
    const opened = await handlePdfExternalOpen(source, filename, {
      ...sourceOptions,
      title,
      successMessage: "PDF opened externally",
      errorMessage: "Unable to open PDF externally"
    });
    if (!opened) toast.error("Unable to open PDF externally");
  };

  return (
    <div className="fixed inset-0 z-[140] flex flex-col bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className={`flex items-center justify-between gap-3 border-b px-3 py-3 sm:px-4 ${darkMode ? "border-white/10 bg-[#071A24] text-white" : "border-[#DCEDEA] bg-white text-[#113247]"}`}>
        <button onClick={onClose} className={`h-10 w-10 rounded-full grid place-items-center shrink-0 ${darkMode ? "bg-white/10" : "bg-[#E8F8F5]"}`} aria-label="Close PDF viewer">
          <X size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-black sm:text-base">{title}</h2>
          <p className="text-xs opacity-60">{filename}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => handlePdfDownloadOrShare(source, filename, sourceOptions)} className={`h-10 w-10 rounded-full grid place-items-center ${darkMode ? "bg-white/10" : "bg-[#E8F8F5]"}`} aria-label="Download or share PDF">
            <Download size={18} />
          </button>
          <button onClick={() => handlePdfPrint(source, filename, sourceOptions)} className={`h-10 w-10 rounded-full grid place-items-center ${darkMode ? "bg-white/10" : "bg-[#E8F8F5]"}`} aria-label="Print PDF">
            <Printer size={18} />
          </button>
          <button onClick={openExternal} className={`h-10 w-10 rounded-full grid place-items-center ${darkMode ? "bg-white/10" : "bg-[#E8F8F5]"}`} aria-label="Open PDF externally">
            <ExternalLink size={18} />
          </button>
        </div>
      </div>

      <div className={`flex items-center justify-between gap-2 border-b px-3 py-2 text-sm ${darkMode ? "border-white/10 bg-[#0B242B] text-white" : "border-[#DCEDEA] bg-[#F9FCFB] text-[#113247]"}`}>
        <div className="flex items-center gap-1">
          <button onClick={goToPrevious} disabled={pageNumber <= 1} className={`h-9 w-9 rounded-full grid place-items-center disabled:opacity-40 ${darkMode ? "bg-white/10" : "bg-[#E8F8F5]"}`} aria-label="Previous PDF page">
            <ChevronLeft size={18} />
          </button>
          <button onClick={goToNext} disabled={!pageCount || pageNumber >= pageCount} className={`h-9 w-9 rounded-full grid place-items-center disabled:opacity-40 ${darkMode ? "bg-white/10" : "bg-[#E8F8F5]"}`} aria-label="Next PDF page">
            <ChevronRight size={18} />
          </button>
        </div>
        <span className="font-bold">Page {pageNumber}{pageCount ? ` / ${pageCount}` : ""}</span>
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} className={`h-9 w-9 rounded-full grid place-items-center ${darkMode ? "bg-white/10" : "bg-[#E8F8F5]"}`} aria-label="Zoom out">
            <Minus size={17} />
          </button>
          <span className="w-12 text-center text-xs font-black">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className={`h-9 w-9 rounded-full grid place-items-center ${darkMode ? "bg-white/10" : "bg-[#E8F8F5]"}`} aria-label="Zoom in">
            <Plus size={17} />
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-auto px-3 py-4 ${darkMode ? "bg-[#06151C]" : "bg-[#EAF5F3]"}`}>
        {loading && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
            <Loader2 className="animate-spin text-[#71CFC2]" size={32} />
            <p className={`text-sm font-bold ${darkMode ? "text-slate-200" : "text-[#113247]"}`}>Loading PDF...</p>
          </div>
        )}
        {error && (
          <div className={`mx-auto mt-8 max-w-sm rounded-lg border p-5 text-center ${darkMode ? "border-white/10 bg-white/10 text-white" : "border-[#DCEDEA] bg-white text-[#113247]"}`}>
            <p className="font-black">Unable to open this PDF in the app.</p>
            <p className="mt-2 text-sm opacity-70">The link may have expired, or this device may need the external PDF viewer.</p>
            <button onClick={openExternal} className="mt-4 rounded-lg bg-[#71CFC2] px-4 py-3 font-black text-[#062F63]">
              Open externally
            </button>
          </div>
        )}
        {file && !error && (
          <div className="mx-auto flex min-h-[60vh] justify-center">
            <canvas ref={canvasRef} className="mx-auto overflow-hidden rounded-lg bg-white shadow-2xl" />
          </div>
        )}
      </div>
    </div>
  );
}
