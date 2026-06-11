/* eslint-disable react-refresh/only-export-components */
import { useEffect, useId, useRef } from "react";
import {
  AlertTriangle,
  Check,
  Info,
  KeyRound,
  MessageSquareX,
  Printer,
  ShieldAlert,
  Trash2,
  UserMinus,
  UserX,
  X
} from "lucide-react";

const toneStyles = {
  info: {
    icon: Info,
    badge: "from-[#80B8FF] to-[#3B82F6] shadow-[0_12px_26px_rgba(59,130,246,0.24)]",
    primary: "bg-[#71CFC2] text-[#062F63] hover:bg-[#8DE0D7]",
    accent: "text-[#0F8F83] dark:text-[#71CFC2]"
  },
  warning: {
    icon: AlertTriangle,
    badge: "from-[#FFD66B] to-[#F59E0B] shadow-[0_12px_26px_rgba(245,158,11,0.25)]",
    primary: "bg-[#71CFC2] text-[#062F63] hover:bg-[#8DE0D7]",
    accent: "text-amber-700 dark:text-amber-300"
  },
  danger: {
    icon: AlertTriangle,
    badge: "from-[#FF7580] to-[#FF4D5D] shadow-[0_12px_26px_rgba(255,77,93,0.26)]",
    primary: "bg-red-500 text-white hover:bg-red-600 disabled:bg-red-400",
    accent: "text-red-600 dark:text-red-300"
  },
  success: {
    icon: Check,
    badge: "from-[#86E2D5] to-[#0F8F83] shadow-[0_12px_26px_rgba(15,143,131,0.23)]",
    primary: "bg-[#71CFC2] text-[#062F63] hover:bg-[#8DE0D7]",
    accent: "text-[#0F8F83] dark:text-[#71CFC2]"
  }
};

export default function AppPopup({
  open = false,
  onClose,
  darkMode = false,
  tone = "info",
  variant,
  icon,
  title,
  message,
  steps = [],
  footerLabel = "ACTION CHECK",
  primaryAction,
  secondaryAction,
  primaryLabel = "OK",
  primaryLoadingLabel = "Working...",
  secondaryLabel = "Cancel",
  onPrimary,
  onSecondary,
  primaryLoading = false,
  primaryDisabled = false,
  secondaryDisabled = false,
  showSecondary = true,
  loading = false,
  closeOnBackdrop = false,
  zIndex = 140,
  children
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const primaryRef = useRef(null);
  const effectiveTone = variant || tone;
  const styles = toneStyles[effectiveTone] || toneStyles.info;
  const Icon = icon || styles.icon;
  const effectivePrimaryLoading = loading || primaryLoading;
  const effectivePrimaryDisabled = primaryDisabled || primaryAction?.disabled;
  const effectiveSecondaryDisabled = secondaryDisabled || secondaryAction?.disabled;
  const effectivePrimaryLabel = primaryAction?.label || primaryLabel;
  const effectivePrimaryLoadingLabel = primaryAction?.loadingLabel || primaryLoadingLabel;
  const effectiveSecondaryLabel = secondaryAction?.label || secondaryLabel;
  const effectiveOnPrimary = primaryAction?.onClick || onPrimary;
  const effectiveOnSecondary = secondaryAction?.onClick || onSecondary;
  const effectiveShowSecondary = secondaryAction ? true : showSecondary;
  const controlsDisabled = effectivePrimaryLoading || effectivePrimaryDisabled || effectiveSecondaryDisabled;

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => primaryRef.current?.focus(), 0);

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !controlsDisabled) {
        event.preventDefault();
        onClose?.();
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [controlsDisabled, onClose, open]);

  if (!open) return null;

  const handleSecondary = () => {
    if (effectiveSecondaryDisabled || effectivePrimaryLoading) return;
    if (effectiveOnSecondary) effectiveOnSecondary();
    else onClose?.();
  };

  const handlePrimary = () => {
    if (effectivePrimaryDisabled || effectivePrimaryLoading) return;
    if (effectiveOnPrimary) effectiveOnPrimary();
    else onClose?.();
  };

  const handleBackdrop = (event) => {
    if (closeOnBackdrop && event.target === event.currentTarget && !controlsDisabled) {
      onClose?.();
    }
  };

  return (
    <div
      className="fixed inset-0 grid place-items-center bg-black/55 px-4 py-6 backdrop-blur-sm animate-in fade-in duration-150"
      style={{ zIndex }}
      onMouseDown={handleBackdrop}
    >
      <div
        ref={dialogRef}
        className={`relative w-full max-w-sm overflow-hidden rounded-3xl border p-5 shadow-[0_24px_70px_rgba(11,55,96,0.22)] ${
          darkMode
            ? "bg-[#092A38] border-[#71CFC2]/30 text-white"
            : "bg-white border-[#CDEBE7] text-[#113247]"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <span
          className={`absolute left-[-15px] top-[84px] h-7 w-7 rounded-full border ${
            darkMode ? "bg-[#071A24] border-[#71CFC2]/25" : "bg-[#EAF8F5] border-[#CDEBE7]"
          }`}
          aria-hidden="true"
        />
        <span
          className={`absolute right-[-15px] top-[84px] h-7 w-7 rounded-full border ${
            darkMode ? "bg-[#071A24] border-[#71CFC2]/25" : "bg-[#EAF8F5] border-[#CDEBE7]"
          }`}
          aria-hidden="true"
        />

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={controlsDisabled}
            className={`absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full transition disabled:opacity-40 ${
              darkMode
                ? "bg-white/10 text-slate-200 hover:bg-white/15"
                : "bg-[#E8F8F5] text-[#0B3760] hover:bg-[#DFF7F3]"
            }`}
            aria-label="Close popup"
          >
            <X size={18} />
          </button>
        )}

        <div
          className={`mb-4 flex items-center gap-3 border-b border-dashed pb-4 pr-10 ${
            darkMode ? "border-[#71CFC2]/30" : "border-[#BDEBE5]"
          }`}
        >
          <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-gradient-to-br text-white ${styles.badge}`}>
            <Icon size={26} />
          </div>
          <div>
            <h3 id={titleId} className="text-[23px] font-black leading-tight tracking-[-0.03em]">
              {title}
            </h3>
            {message && (
              <p className={`mt-1 text-sm leading-5 ${darkMode ? "text-[#C8E5E0]" : "text-slate-500"}`}>
                {message}
              </p>
            )}
          </div>
        </div>

        {steps.length > 0 && (
          <ol className="mb-4 grid gap-2.5">
            {steps.slice(0, 2).map((step, index) => {
              const stepTitle = typeof step === "string" ? step : step.title;
              const stepBody = typeof step === "string" ? "" : step.body;
              return (
                <li
                  key={`${stepTitle}-${index}`}
                  className={`flex items-start gap-2.5 rounded-2xl border p-3 ${
                    darkMode
                      ? "bg-white/5 border-[#71CFC2]/20"
                      : "bg-gradient-to-b from-[#F8FFFD] to-[#EFFAF7] border-[#DCEDEA]"
                  }`}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] bg-[#71CFC2] text-sm font-black text-[#062F63]">
                    {index + 1}
                  </span>
                  <span>
                    <strong className="block text-sm leading-5">{stepTitle}</strong>
                    {stepBody && (
                      <span className={`block text-xs leading-5 ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
                        {stepBody}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {children && <div className="mb-4">{children}</div>}

        {footerLabel && (
          <div className={`mb-4 flex items-center gap-2 text-xs font-black ${styles.accent}`}>
            <span className={`h-0.5 flex-1 ${darkMode ? "bg-[#71CFC2]/30" : "bg-[#BDEBE5]"}`} />
            <span>{footerLabel}</span>
            <span className={`h-0.5 flex-1 ${darkMode ? "bg-[#71CFC2]/30" : "bg-[#BDEBE5]"}`} />
          </div>
        )}

        <div className="flex gap-3 max-[420px]:flex-col">
          {effectiveShowSecondary && (
            <button
              type="button"
              onClick={handleSecondary}
              disabled={effectiveSecondaryDisabled || effectivePrimaryLoading}
              className={`flex-1 rounded-2xl px-4 py-3 text-sm font-black transition disabled:opacity-50 ${
                darkMode
                  ? "bg-white/10 text-slate-200 hover:bg-white/15"
                  : "bg-[#E8F8F5] text-[#0B3760] hover:bg-[#DFF7F3]"
              }`}
            >
              {effectiveSecondaryLabel}
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={handlePrimary}
            disabled={effectivePrimaryDisabled || effectivePrimaryLoading}
            className={`flex-1 rounded-2xl px-4 py-3 text-sm font-black transition disabled:opacity-50 ${
              primaryAction?.danger ? toneStyles.danger.primary : styles.primary
            }`}
          >
            {effectivePrimaryLoading ? effectivePrimaryLoadingLabel : effectivePrimaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const popupPresets = {
  selectCasesToPrint: (overrides = {}) => ({
    tone: "warning",
    icon: Printer,
    title: "No cases selected",
    message: "You need at least one case before printing.",
    steps: [
      { title: "Choose a case", body: "Tick the checkbox on any case card." },
      { title: "Create report", body: "Press the print icon to generate the PDF." }
    ],
    footerLabel: "EXPORT CHECK",
    primaryLabel: "Got it",
    showSecondary: false,
    ...overrides
  }),

  deleteConversation: ({ colleagueName, ...overrides } = {}) => ({
    tone: "danger",
    icon: MessageSquareX,
    title: "Delete conversation?",
    message: `This will delete the conversation with ${colleagueName || "this colleague"} and remove its messages.`,
    footerLabel: "MESSAGE CHECK",
    primaryLabel: "Delete",
    primaryLoadingLabel: "Deleting...",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  deleteUser: ({ email, ...overrides } = {}) => ({
    tone: "danger",
    icon: UserX,
    title: "Delete this user?",
    message: `This will permanently delete ${email || "this account"} and linked app data. This cannot be undone.`,
    footerLabel: "ADMIN ACTION",
    primaryLabel: "Delete permanently",
    primaryLoadingLabel: "Deleting...",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  deleteCaseLog: ({ caseTitle, ...overrides } = {}) => ({
    tone: "danger",
    icon: Trash2,
    title: "Delete this case?",
    message: `This will permanently remove ${caseTitle || "this case log"} and any linked local media.`,
    footerLabel: "CASE LOGS",
    primaryLabel: "Delete case",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  deleteProtocol: ({ protocolName, ...overrides } = {}) => ({
    tone: "danger",
    icon: Trash2,
    title: "Delete this protocol?",
    message: `This will permanently remove ${protocolName || "this protocol"}. This cannot be undone.`,
    footerLabel: "PROTOCOLS",
    primaryLabel: "Delete protocol",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  deleteVaultEntry: ({ platformName, ...overrides } = {}) => ({
    tone: "danger",
    icon: Trash2,
    title: "Delete vault entry?",
    message: `This will permanently remove the saved credentials for ${platformName || "this platform"}.`,
    footerLabel: "VAULT",
    primaryLabel: "Delete entry",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  deleteDrugDose: ({ drugName, ...overrides } = {}) => ({
    tone: "danger",
    icon: Trash2,
    title: "Delete dose record?",
    message: `This will permanently remove your custom dose record${drugName ? ` for ${drugName}` : ""}.`,
    footerLabel: "FORMULARY",
    primaryLabel: "Delete record",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  deleteCpdEntry: ({ entryTitle, ...overrides } = {}) => ({
    tone: "danger",
    icon: Trash2,
    title: "Delete CPD entry?",
    message: `This will permanently remove ${entryTitle || "this CPD record"} from your portfolio.`,
    footerLabel: "CPD RECORD",
    primaryLabel: "Delete entry",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  deleteFutureReading: ({ entryTitle, ...overrides } = {}) => ({
    tone: "danger",
    icon: Trash2,
    title: "Remove reading item?",
    message: `This will permanently remove ${entryTitle || "this item"} from your future reading list.`,
    footerLabel: "FUTURE READING",
    primaryLabel: "Remove item",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  missingRequiredField: (field = "required field", overrides = {}) => ({
    variant: "warning",
    title: "Missing information",
    message: `Add the ${field} before continuing.`,
    footerLabel: "FORM CHECK",
    steps: [
      { title: "Complete the field", body: `Fill in the ${field}.` },
      { title: "Try again", body: "Then repeat the action." }
    ],
    primaryLabel: "Got it",
    showSecondary: false,
    ...overrides
  }),

  unsavedChanges: (overrides = {}) => ({
    variant: "warning",
    title: "Unsaved changes",
    message: "You have changes that haven't been saved yet.",
    footerLabel: "SETTINGS CHECK",
    steps: [
      { title: "Save changes", body: "Keep your new settings." },
      { title: "Or leave anyway", body: "Discard the changes and continue." }
    ],
    ...overrides
  }),

  interactionWarning: (overrides = {}) => ({
    variant: "danger",
    icon: ShieldAlert,
    title: "Interaction found",
    message: "These selected drugs may require caution or monitoring.",
    footerLabel: "DRUG SAFETY",
    steps: [
      { title: "Review interaction", body: "Read the warning details before continuing." },
      { title: "Use clinical judgement", body: "Check patient context, dose and alternatives." }
    ],
    primaryLabel: "Acknowledge",
    showSecondary: false,
    ...overrides
  }),

  deleteItem: (itemName = "this item", overrides = {}) => ({
    variant: "danger",
    icon: Trash2,
    title: "Delete item?",
    message: `This will permanently remove ${itemName}.`,
    footerLabel: "DELETE CHECK",
    steps: [
      { title: "Check the item", body: "Make sure this is the correct item." },
      { title: "Confirm deletion", body: "This action cannot be undone." }
    ],
    primaryLabel: "Delete",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  accessRestricted: (overrides = {}) => ({
    variant: "warning",
    title: "Access restricted",
    message: "This feature is not available for your current account type.",
    footerLabel: "ACCESS CHECK",
    steps: [
      { title: "Check your plan", body: "Some tools are limited by subscription tier." },
      { title: "Try another tool", body: "Use an available feature from the menu." }
    ],
    primaryLabel: "Got it",
    showSecondary: false,
    ...overrides
  }),

  printBlocked: (overrides = {}) => ({
    variant: "warning",
    icon: Printer,
    title: "Nothing to print",
    message: "Select or add content before creating a printout.",
    footerLabel: "PRINT CHECK",
    steps: [
      { title: "Add content", body: "Choose the records or details to include." },
      { title: "Print again", body: "Then press the print button." }
    ],
    primaryLabel: "Got it",
    showSecondary: false,
    ...overrides
  }),

  deleteNetworkPost: (overrides = {}) => ({
    tone: "danger",
    icon: Trash2,
    title: "Delete this post?",
    message: "This will remove the post from the network feed and delete any attached images.",
    footerLabel: "NETWORK",
    primaryLabel: "Delete post",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  removeConnection: ({ colleagueName, ...overrides } = {}) => ({
    tone: "danger",
    icon: UserMinus,
    title: "Remove colleague?",
    message: `This will remove ${colleagueName || "this colleague"} from your VetLearn network.`,
    footerLabel: "NETWORK",
    primaryLabel: "Remove colleague",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  deleteNotification: ({ title, ...overrides } = {}) => ({
    tone: "danger",
    icon: Trash2,
    title: "Delete notification?",
    message: title ? `This will permanently delete "${title}".` : "This notification will be permanently deleted.",
    footerLabel: "NOTIFICATIONS",
    primaryLabel: "Delete",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  deleteNotifications: ({ count, tabLabel, ...overrides } = {}) => ({
    tone: "danger",
    icon: Trash2,
    title: "Delete notifications?",
    message: `This will permanently delete ${count || "these"} ${tabLabel || "notification"} notification${count === 1 ? "" : "s"}.`,
    footerLabel: "NOTIFICATIONS",
    primaryLabel: "Delete all",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  deleteAdminMessage: ({ title, ...overrides } = {}) => ({
    tone: "danger",
    icon: Trash2,
    title: "Delete admin message?",
    message: `This removes "${title || "this announcement"}" from user notification panels.`,
    footerLabel: "ADMIN ACTION",
    primaryLabel: "Delete message",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  removeAiApiKey: (overrides = {}) => ({
    tone: "danger",
    icon: KeyRound,
    title: "Remove AI API key?",
    message: "This will remove the saved key from this device and disable VetLearn AI features.",
    footerLabel: "AI SETTINGS",
    primaryLabel: "Remove key",
    primaryLoadingLabel: "Removing...",
    secondaryLabel: "Cancel",
    ...overrides
  }),

  gdprImageWarning: (overrides = {}) => ({
    tone: "warning",
    icon: ShieldAlert,
    title: "Check for sensitive data",
    message: "Before posting images, confirm they do not contain client names, owner details, addresses, phone numbers, microchip numbers, labels, consent forms, invoices, or other identifiable personal data.",
    steps: [
      { title: "Redact sensitive details", body: "Remove anything that could identify a client or patient owner." },
      { title: "Confirm permission", body: "Only post images you are authorised to share." }
    ],
    footerLabel: "NETWORK SAFETY",
    primaryLabel: "I confirm, post images",
    secondaryLabel: "Cancel",
    ...overrides
  })
};
