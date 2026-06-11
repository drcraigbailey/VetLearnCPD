import { AlertTriangle, Check, Info, Loader2, X } from "lucide-react";
import toast, { resolveValue, Toaster } from "react-hot-toast";

const toastStyles = {
  success: {
    icon: Check,
    badge: "from-[#86E2D5] to-[#0F8F83]",
    accent: "bg-[#0F8F83]",
    label: "SUCCESS"
  },
  error: {
    icon: X,
    badge: "from-[#FF7580] to-[#FF4D5D]",
    accent: "bg-[#FF4D5D]",
    label: "ACTION NEEDED"
  },
  loading: {
    icon: Loader2,
    badge: "from-[#80B8FF] to-[#3B82F6]",
    accent: "bg-[#3B82F6]",
    label: "WORKING"
  },
  blank: {
    icon: Info,
    badge: "from-[#FFD66B] to-[#F59E0B]",
    accent: "bg-[#F59E0B]",
    label: "NOTICE"
  },
  custom: {
    icon: AlertTriangle,
    badge: "from-[#FFD66B] to-[#F59E0B]",
    accent: "bg-[#F59E0B]",
    label: "NOTICE"
  }
};

export function CustomToast({ toast: toastItem, darkMode = false }) {
  const config = toastStyles[toastItem.type] || toastStyles.blank;
  const Icon = config.icon;
  const isLoading = toastItem.type === "loading";

  return (
    <div
      className={`relative flex w-[min(420px,calc(100vw-24px))] items-center gap-3 overflow-hidden rounded-2xl border p-3 pr-2 shadow-[0_18px_45px_rgba(11,55,96,0.20)] transition-all duration-200 ${
        toastItem.visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
      } ${
        darkMode
          ? "border-[#71CFC2]/25 bg-[#092A38] text-white"
          : "border-[#CDEBE7] bg-white text-[#113247]"
      }`}
      role="status"
      aria-live={toastItem.type === "error" ? "assertive" : "polite"}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${config.accent}`} aria-hidden="true" />

      <div className={`ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-gradient-to-br text-white shadow-lg ${config.badge}`}>
        <Icon size={21} className={isLoading ? "animate-spin" : ""} strokeWidth={2.5} />
      </div>

      <div className="min-w-0 flex-1">
        <span className={`block text-[10px] font-black tracking-[0.15em] ${darkMode ? "text-[#71CFC2]" : "text-[#0F8F83]"}`}>
          {config.label}
        </span>
        <div className={`mt-0.5 text-sm font-bold leading-5 ${darkMode ? "text-slate-100" : "text-[#113247]"}`}>
          {resolveValue(toastItem.message, toastItem)}
        </div>
      </div>

      {!isLoading && (
        <button
          type="button"
          onClick={() => toast.dismiss(toastItem.id)}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${
            darkMode
              ? "bg-white/10 text-slate-300 hover:bg-white/15"
              : "bg-[#E8F8F5] text-[#0B3760] hover:bg-[#DFF7F3]"
          }`}
          aria-label="Dismiss notification"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function HybridToaster({ darkMode = false }) {
  return (
    <Toaster
      position="top-center"
      gutter={10}
      containerStyle={{ top: 14, zIndex: 200 }}
      toastOptions={{
        duration: 4500,
        success: { duration: 3500 },
        error: { duration: 6000 }
      }}
    >
      {(toastItem) => <CustomToast toast={toastItem} darkMode={darkMode} />}
    </Toaster>
  );
}
