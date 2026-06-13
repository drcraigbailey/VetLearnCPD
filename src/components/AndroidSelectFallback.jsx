import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";

const isAndroidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export default function AndroidSelectFallback({ darkMode = false }) {
  const [activeSelect, setActiveSelect] = useState(null);
  const [interactionReady, setInteractionReady] = useState(false);
  const selectElementRef = useRef(null);

  useEffect(() => {
    if (!isAndroidApp) return undefined;

    document.documentElement.classList.add("android-native-selects");

    const openSelect = (event) => {
      const select = event.target instanceof Element ? event.target.closest("select") : null;
      if (!(select instanceof HTMLSelectElement) || select.disabled || select.multiple) return;

      event.preventDefault();
      event.stopPropagation();
      select.blur();
      selectElementRef.current = select;
      setInteractionReady(false);

      setActiveSelect({
        title: getSelectTitle(select),
        value: select.value,
        options: Array.from(select.options).map((option) => ({
          value: option.value,
          label: option.label || option.textContent || option.value,
          disabled: option.disabled,
          hidden: option.hidden
        }))
      });
    };

    // Open after the initiating finger has lifted. Mounting the sheet on
    // pointerdown allows that same touch to land on an option underneath it.
    document.addEventListener("click", openSelect, { capture: true, passive: false });
    return () => {
      selectElementRef.current = null;
      document.documentElement.classList.remove("android-native-selects");
      document.removeEventListener("click", openSelect, true);
    };
  }, []);

  useEffect(() => {
    if (!activeSelect) return undefined;

    const timer = window.setTimeout(() => setInteractionReady(true), 280);
    return () => window.clearTimeout(timer);
  }, [activeSelect]);

  if (!isAndroidApp || !activeSelect) return null;

  const chooseOption = (option) => {
    if (!interactionReady || option.disabled || option.hidden) return;

    const select = selectElementRef.current;
    if (!(select instanceof HTMLSelectElement)) {
      setActiveSelect(null);
      return;
    }
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (valueSetter) valueSetter.call(select, option.value);

    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    select.focus({ preventScroll: true });
    setActiveSelect(null);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end bg-black/55 backdrop-blur-sm"
      role="presentation"
      onClick={(event) => {
        if (interactionReady && event.target === event.currentTarget) setActiveSelect(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={activeSelect.title}
        className={`max-h-[82vh] w-full overflow-hidden rounded-t-3xl border-t shadow-2xl ${
          darkMode
            ? "border-white/10 bg-[#0B242B] text-white"
            : "border-[#DCEDEA] bg-white text-[#113247]"
        }`}
      >
        <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${darkMode ? "border-white/10" : "border-[#DCEDEA]"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0F8F83]"}`}>
              <ChevronDown size={20} />
            </span>
            <h2 className="truncate text-lg font-black">{activeSelect.title}</h2>
          </div>
          <button
            type="button"
            onClick={() => setActiveSelect(null)}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`}
            aria-label="Close options"
          >
            <X size={20} />
          </button>
        </div>

        <div className={`max-h-[calc(82vh-74px)] touch-pan-y overscroll-contain overflow-y-auto p-3 pb-[max(1rem,env(safe-area-inset-bottom))] ${interactionReady ? "" : "pointer-events-none"}`}>
          {activeSelect.options.filter(option => !option.hidden).map((option, index) => {
            const selected = option.value === activeSelect.value;
            return (
              <button
                type="button"
                key={`${option.value}-${index}`}
                disabled={option.disabled}
                onClick={() => chooseOption(option)}
                className={`mb-1 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-base transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected
                    ? "bg-[#71CFC2] font-black text-[#062F63]"
                    : darkMode
                      ? "bg-white/5 text-slate-100 active:bg-white/10"
                      : "bg-[#F7FBFA] text-[#113247] active:bg-[#E8F8F5]"
                }`}
              >
                <span>{option.label}</span>
                {selected && <Check size={19} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

function getSelectTitle(select) {
  const labelledBy = select.getAttribute("aria-labelledby");
  if (labelledBy) {
    const label = document.getElementById(labelledBy)?.textContent?.trim();
    if (label) return label;
  }

  const ariaLabel = select.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const explicitLabel = select.labels?.[0]?.textContent?.trim();
  if (explicitLabel) return explicitLabel;

  const firstOption = select.options?.[0]?.textContent?.trim();
  return firstOption || select.name || "Choose an option";
}
