import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare, Clipboard, Copy, Scissors } from "lucide-react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import toast from "react-hot-toast";

const NativeClipboard = registerPlugin("NativeClipboard");
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE = 12;

export default function AndroidClipboardToolbar({ darkMode = false }) {
  const editableRef = useRef(null);
  const targetRef = useRef(null);
  const hideTimerRef = useRef(null);
  const longPressRef = useRef(null);
  const editableMenuRequestedRef = useRef(false);
  const [toolbar, setToolbar] = useState(null);

  const theme = useMemo(() => {
    if (darkMode) {
      return {
        bar: "border-white/10 bg-[#071A24] text-white shadow-2xl",
        button: "bg-white/10 text-slate-100 active:bg-white/20 disabled:opacity-40",
        primary: "bg-[#71CFC2] text-[#062F63] active:bg-[#5BB8AD] disabled:opacity-40"
      };
    }

    return {
      bar: "border-[#DCEDEA] bg-white text-[#113247] shadow-[0_14px_35px_rgba(11,55,96,0.16)]",
      button: "bg-[#E8F8F5] text-[#0B3760] active:bg-[#DCEDEA] disabled:opacity-40",
      primary: "bg-[#71CFC2] text-[#062F63] active:bg-[#5BB8AD] disabled:opacity-40"
    };
  }, [darkMode]);

  useEffect(() => {
    if (!shouldUseClipboardToolbar()) return undefined;

    const update = () => window.setTimeout(() => updateToolbar(), 0);
    const onFocusIn = (event) => {
      const editable = getEditableElement(event.target);
      if (!editable) return;
      editableRef.current = editable;
      targetRef.current = editable;
      editableMenuRequestedRef.current = false;
      setToolbar(null);
    };
    const onFocusOut = () => {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        editableRef.current = null;
        editableMenuRequestedRef.current = false;
        setToolbar(null);
      }, 180);
    };
    const onInput = () => {
      editableMenuRequestedRef.current = false;
      update();
    };
    const onPointerDown = (event) => {
      if (event.pointerType === "mouse") return;
      const editable = getEditableElement(event.target);
      const textBlock = editable || getTextBlockElement(event.target);
      if (!textBlock) return;

      window.clearTimeout(longPressRef.current?.timer);
      const startX = event.clientX;
      const startY = event.clientY;
      const timer = window.setTimeout(() => {
        if (!document.contains(textBlock)) return;
        targetRef.current = textBlock;
        if (editable) {
          editableRef.current = editable;
          editableMenuRequestedRef.current = true;
          updateToolbar({ allowEditableMenu: true });
        } else {
          updateToolbar({ fallbackElement: textBlock });
        }
      }, LONG_PRESS_MS);

      longPressRef.current = { timer, startX, startY };
    };
    const onPointerMove = (event) => {
      const longPress = longPressRef.current;
      if (!longPress) return;

      const moved = Math.abs(event.clientX - longPress.startX) > LONG_PRESS_MOVE_TOLERANCE
        || Math.abs(event.clientY - longPress.startY) > LONG_PRESS_MOVE_TOLERANCE;
      if (moved) {
        window.clearTimeout(longPress.timer);
        longPressRef.current = null;
      }
    };
    const clearLongPress = () => {
      window.clearTimeout(longPressRef.current?.timer);
      longPressRef.current = null;
    };
    const onContextMenu = (event) => {
      const editable = getEditableElement(event.target);
      const textBlock = editable || getTextBlockElement(event.target);
      if (!textBlock) return;

      event.preventDefault();
      targetRef.current = textBlock;
      if (editable) {
        editableRef.current = editable;
        editableMenuRequestedRef.current = true;
        updateToolbar({ allowEditableMenu: true });
      } else {
        updateToolbar({ fallbackElement: textBlock });
      }
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("selectionchange", update, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("keyup", update, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", clearLongPress, true);
    document.addEventListener("pointercancel", clearLongPress, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);

    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("selectionchange", update, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("keyup", update, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", clearLongPress, true);
      document.removeEventListener("pointercancel", clearLongPress, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.clearTimeout(hideTimerRef.current);
      clearLongPress();
    };
  }, []);

  const updateToolbar = ({ allowEditableMenu = false, fallbackElement = null } = {}) => {
    const editable = editableRef.current && document.contains(editableRef.current)
      ? editableRef.current
      : getEditableElement(document.activeElement);

    if (editable) {
      const hasSelection = getEditableSelectionText(editable).length > 0;
      const shouldShowEditableToolbar = hasSelection || allowEditableMenu || editableMenuRequestedRef.current;
      if (!shouldShowEditableToolbar) {
        setToolbar(null);
        return;
      }

      editableRef.current = editable;
      targetRef.current = editable;
      setToolbar({
        editable: true,
        writable: isWritableEditable(editable),
        hasSelection,
        textAvailable: getEditableText(editable).length > 0,
        fallbackText: "",
        position: getBottomToolbarPosition()
      });
      return;
    }

    const selection = window.getSelection();
    const selectedText = selection?.toString() || "";
    if (selectedText.trim()) {
      setToolbar({
        editable: false,
        writable: false,
        hasSelection: true,
        textAvailable: true,
        fallbackText: "",
        position: getBottomToolbarPosition()
      });
      return;
    }

    const fallbackText = getElementText(fallbackElement || targetRef.current);
    if (fallbackText) {
      setToolbar({
        editable: false,
        writable: false,
        hasSelection: false,
        textAvailable: true,
        fallbackText,
        position: getBottomToolbarPosition()
      });
      return;
    }

    setToolbar(null);
  };

  if (!shouldUseClipboardToolbar() || !toolbar) return null;

  const copy = async () => {
    const editable = editableRef.current;
    const text = toolbar.editable
      ? getEditableSelectionText(editable) || getEditableText(editable)
      : window.getSelection()?.toString() || toolbar.fallbackText || "";
    if (!text) return;
    await writeClipboard(text);
    toast.success("Copied");
    setToolbar(null);
  };

  const cut = async () => {
    const editable = editableRef.current;
    if (!toolbar.editable || !toolbar.writable || !editable) return;

    const selected = getEditableSelectionText(editable);
    if (!selected) {
      await copy();
      return;
    }

    await writeClipboard(selected);
    deleteEditableSelection(editable);
    toast.success("Cut");
    setToolbar(null);
  };

  const paste = async () => {
    const editable = editableRef.current;
    if (!toolbar.editable || !toolbar.writable || !editable) return;

    const text = await readClipboard();
    if (!text) {
      toast.error("Clipboard is empty");
      return;
    }

    insertEditableText(editable, text);
    editableMenuRequestedRef.current = false;
    setToolbar(null);
  };

  const selectAll = () => {
    const editable = editableRef.current;
    if (toolbar.editable && editable) {
      selectEditableText(editable);
      updateToolbar({ allowEditableMenu: true });
      return;
    }

    const element = targetRef.current;
    if (element) {
      selectElementText(element);
      updateToolbar({ fallbackElement: element });
    }
  };

  return createPortal(
    <div
      className="fixed left-3 right-3 z-[2147483647] flex justify-center"
      style={{
        top: `${toolbar.position.top}px`,
        transform: "translateZ(0)"
      }}
    >
      <div className={`flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border p-1.5 ${theme.bar}`}>
        {toolbar.editable && (
          <ToolbarButton className={theme.primary} icon={<Clipboard size={16} />} onClick={paste} disabled={!toolbar.writable}>
            Paste
          </ToolbarButton>
        )}
        <ToolbarButton className={theme.button} icon={<CheckSquare size={16} />} onClick={selectAll} disabled={!toolbar.textAvailable}>
          Select all
        </ToolbarButton>
        <ToolbarButton className={theme.button} icon={<Copy size={16} />} onClick={copy} disabled={!toolbar.textAvailable && !toolbar.hasSelection}>
          Copy
        </ToolbarButton>
        {toolbar.editable && (
          <ToolbarButton className={theme.button} icon={<Scissors size={16} />} onClick={cut} disabled={!toolbar.writable || !toolbar.hasSelection}>
            Cut
          </ToolbarButton>
        )}
      </div>
    </div>,
    document.body
  );
}

function ToolbarButton({ children, className, disabled, icon, onClick }) {
  return (
    <button
      type="button"
      className={`flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-black ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function shouldUseClipboardToolbar() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (/Android/i.test(navigator.userAgent)) return true;

  try {
    if (Capacitor.isNativePlatform?.() && Capacitor.getPlatform?.() === "android") return true;
  } catch {
    return false;
  }

  return false;
}

async function readClipboard() {
  try {
    const result = await NativeClipboard.read();
    return result?.text || "";
  } catch {
    return navigator.clipboard?.readText ? navigator.clipboard.readText() : "";
  }
}

async function writeClipboard(text) {
  try {
    await NativeClipboard.write({ text });
  } catch {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard is unavailable");
    await navigator.clipboard.writeText(text);
  }
}

function getEditableElement(target) {
  if (!(target instanceof Element)) return null;
  const element = target.closest("input, textarea, [contenteditable='true']");
  if (!element) return null;
  if (element instanceof HTMLInputElement) {
    const type = (element.type || "text").toLowerCase();
    if (["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type)) return null;
  }
  return element;
}

function getTextBlockElement(target) {
  if (!(target instanceof Element)) return null;
  const element = target.closest("p, li, h1, h2, h3, h4, h5, h6, article, section, div");
  if (!element || element.closest("button, [role='button'], nav")) return null;
  return getElementText(element) ? element : null;
}

function isWritableEditable(element) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }
  return element?.isContentEditable;
}

function getEditableText(element) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value || "";
  return element?.textContent || "";
}

function getElementText(element) {
  if (!(element instanceof Element)) return "";
  return (element.innerText || element.textContent || "").trim();
}

function getEditableSelectionText(element) {
  if (!element) return "";
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    return start === end ? "" : element.value.slice(start, end);
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.toString()) return "";
  return element.contains(selection.anchorNode) && element.contains(selection.focusNode) ? selection.toString() : "";
}

function selectEditableText(element) {
  element.focus({ preventScroll: true });
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.setSelectionRange(0, element.value.length);
    return;
  }

  selectElementText(element);
}

function selectElementText(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insertEditableText(element, text) {
  element.focus({ preventScroll: true });
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    element.setRangeText(text, start, end, "end");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  document.execCommand("insertText", false, text);
}

function deleteEditableSelection(element) {
  element.focus({ preventScroll: true });
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? start;
    if (start === end) return;
    element.setRangeText("", start, end, "start");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  document.execCommand("delete");
}

function getBottomToolbarPosition() {
  const viewport = window.visualViewport;
  const height = viewport?.height || window.innerHeight;
  const keyboardOpen = viewport ? viewport.height < window.innerHeight * 0.86 : false;
  const reservedBottom = keyboardOpen ? 68 : 112;

  return {
    top: Math.max(72, (viewport?.offsetTop || 0) + height - reservedBottom)
  };
}
