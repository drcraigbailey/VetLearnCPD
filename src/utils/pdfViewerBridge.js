const PDF_VIEWER_EVENT = "vetlearn:open-pdf-viewer";

export const openPdfViewer = (payload) => {
  if (typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(PDF_VIEWER_EVENT, { detail: payload }));
  return true;
};

export const subscribePdfViewer = (handler) => {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler(event.detail || null);
  window.addEventListener(PDF_VIEWER_EVENT, listener);
  return () => window.removeEventListener(PDF_VIEWER_EVENT, listener);
};
