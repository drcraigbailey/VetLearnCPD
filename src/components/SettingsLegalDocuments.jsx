import { AlertTriangle, ExternalLink, FileText, Lock, Mail, Shield, Trash2 } from "lucide-react";
import UserDataExportButton from "./UserDataExportButton";

const updatedDate = "5 June 2026";

const documents = [
  {
    id: "privacy",
    title: "Privacy Policy",
    icon: Shield,
    intro: "How VetLearn CPD collects, uses and protects personal data.",
    sections: [
      {
        heading: "Data we collect",
        items: [
          "Account and profile details such as name, email address, role, practice details, contact details and professional information.",
          "App content you create, including CPD records, case logs, protocols, drug notes, messages, notifications, uploaded files and saved preferences.",
          "Technical and security information such as login activity, device/browser details, feature usage, error information and admin/audit events.",
          "Optional AI-related settings and prompts when AI features are enabled by the user."
        ]
      },
      {
        heading: "Why we use it",
        items: [
          "To provide the VetLearn CPD account, learning records, clinical support tools, messaging, admin controls and user preferences.",
          "To keep the service secure, troubleshoot errors, manage access permissions and investigate misuse.",
          "To improve the service and understand which features are useful, using only the minimum information needed."
        ]
      },
      {
        heading: "Lawful basis",
        items: [
          "Contract: to provide the app account and core features requested by the user.",
          "Legitimate interests: to secure the service, keep audit records, prevent misuse and support product improvement.",
          "Consent: where optional marketing, optional device permissions or optional AI/key-based features require a clear choice."
        ]
      },
      {
        heading: "Sharing and storage",
        items: [
          "Data is stored using Supabase and may be processed by hosting, authentication, storage, notification and infrastructure providers used to run the app.",
          "If AI features are enabled, content submitted to AI tools may be sent to the configured AI provider for processing.",
          "VetLearn CPD does not sell personal data. Data should only be shared where needed to run the service, comply with law, protect the service, or with the user's direction."
        ]
      }
    ]
  },
  {
    id: "terms",
    title: "Terms of Use",
    icon: FileText,
    intro: "The practical rules for using VetLearn CPD safely and responsibly.",
    sections: [
      {
        heading: "Use of the app",
        items: [
          "VetLearn CPD is intended for veterinary CPD, learning records, clinical support workflows and professional organisation.",
          "Users are responsible for keeping account details accurate and for protecting their login credentials.",
          "Users must not upload unlawful, offensive, confidential or third-party data unless they have the right and a valid reason to do so."
        ]
      },
      {
        heading: "Clinical responsibility",
        items: [
          "The app is a support and education tool, not a replacement for clinical judgement, local protocols, medicine datasheets or specialist advice.",
          "Drug doses, warnings, calculations and protocols must be checked before use in a real patient.",
          "Users remain responsible for decisions made in clinical practice."
        ]
      },
      {
        heading: "Availability and changes",
        items: [
          "Features may change as the app is improved or as admin access settings are updated.",
          "Access may be suspended if needed for security, misuse, maintenance or legal reasons."
        ]
      }
    ]
  },
  {
    id: "rights",
    title: "Data Rights",
    icon: Lock,
    intro: "How users can ask to access, correct, export or delete their personal data.",
    sections: [
      {
        heading: "Your rights",
        items: [
          "Users can ask for a copy of their personal data, correction of inaccurate data, deletion of eligible data, or restriction/objection where applicable.",
          "Profile details can be corrected in Settings. Data that cannot be edited directly should be requested through the VetLearn CPD administrator.",
          "Deletion requests should be handled by the administrator while self-service account deletion is connected and tested."
        ]
      },
      {
        heading: "Deletion scope",
        items: [
          "A deletion request should review the auth account, profile, preferences, CPD records, case logs, messages, notifications, drug notes, uploaded files and connection records.",
          "Some records may need to be retained or anonymised where required for security, legal, audit or dispute-resolution reasons.",
          "The delete flow should return a clear success or failure message and should not leave avoidable orphaned personal data."
        ]
      },
      {
        heading: "Contact",
        items: [
          "Use the VetLearn CPD administrator/support contact supplied with your account to request access, correction or deletion.",
          "Before public launch, confirm the final public privacy contact email and retention schedule."
        ]
      }
    ]
  },
  {
    id: "retention",
    title: "Retention and Security",
    icon: Trash2,
    intro: "How long data should be kept and the safeguards expected around it.",
    sections: [
      {
        heading: "Retention approach",
        items: [
          "Keep personal data only for as long as it is needed for the account, CPD records, security, legal obligations or legitimate operational purposes.",
          "Admin audit logs should keep necessary security information without storing unnecessary sensitive content.",
          "Backups and logs may persist for a limited period after account deletion, depending on provider retention settings."
        ]
      },
      {
        heading: "Safeguards",
        items: [
          "Personal-data tables should use Supabase Row Level Security with policies that restrict users to their own data unless a verified admin rule applies.",
          "Admin access should be checked server-side for sensitive actions, not only hidden in the React interface.",
          "Sensitive data should not be logged to the browser console or stored unnecessarily."
        ]
      }
    ]
  },
  {
    id: "disclaimer",
    title: "Clinical Disclaimer",
    icon: AlertTriangle,
    intro: "A clear safety note for drug, calculator and protocol features.",
    sections: [
      {
        heading: "Clinical use",
        items: [
          "VetLearn CPD is a CPD, learning and clinical support tool for veterinary professionals.",
          "Information may be incomplete, out of date or not applicable to a particular patient, species, medicine formulation or jurisdiction.",
          "Always check current product literature, local protocols, patient factors and professional guidance before acting."
        ]
      }
    ]
  }
];

const resources = [
  { label: "ICO: individual data protection rights", href: "https://ico.org.uk/global/privacy-notice/your-data-protection-rights/" },
  { label: "ICO: right to erasure", href: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/" },
  { label: "Supabase DPA", href: "https://supabase.com/downloads/docs/Supabase%2BDPA%2B260317.pdf" }
];

export default function SettingsLegalDocuments({ darkMode = false }) {
  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";
  const cardClass = darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]";

  return (
    <section className={`${panelClass} space-y-4`}>
      <div className="flex items-start gap-3">
        <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3 shrink-0`}>
          <FileText size={20} />
        </div>
        <div>
          <h2 className="font-black text-lg">Privacy, Terms and Data Rights</h2>
          <p className="text-sm opacity-60 leading-6">Working documents for VetLearn CPD. Last updated {updatedDate}.</p>
        </div>
      </div>

      <div className={`rounded-lg border p-4 text-sm leading-6 ${darkMode ? "bg-amber-500/10 border-amber-400/20 text-amber-100" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
        These documents support GDPR readiness, but they do not by themselves make the app compliant. Account deletion, data export, RLS, audit logging and processor agreements still need to work in practice.
      </div>

      <div className={`rounded-lg border p-4 ${cardClass}`}>
        <div className="flex items-start gap-3 mb-3">
          <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-2 shrink-0`}>
            <Lock size={18} />
          </div>
          <div>
            <h3 className="font-black">Personal Data Export</h3>
            <p className="text-sm opacity-65 leading-6">Download a JSON copy of the app data currently readable by your account.</p>
          </div>
        </div>
        <UserDataExportButton darkMode={darkMode} />
      </div>

      <div className="space-y-3">
        {documents.map((document, index) => {
          const Icon = document.icon;
          return (
            <details key={document.id} open={index === 0} className={`rounded-lg border ${cardClass}`}>
              <summary className="cursor-pointer list-none p-4">
                <div className="flex items-start gap-3">
                  <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-2 shrink-0`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3 className="font-black">{document.title}</h3>
                    <p className="text-sm opacity-65 leading-6">{document.intro}</p>
                  </div>
                </div>
              </summary>
              <div className="px-4 pb-4 space-y-4">
                {document.sections.map((section) => (
                  <div key={section.heading}>
                    <h4 className="text-sm font-black mb-2">{section.heading}</h4>
                    <ul className="space-y-2 text-sm leading-6 opacity-80 list-disc pl-5">
                      {section.items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      <div className={`rounded-lg border p-4 ${cardClass}`}>
        <div className="flex items-center gap-2 mb-3">
          <Mail size={17} className="text-[#0F8F83]" />
          <h3 className="font-black">External Guidance</h3>
        </div>
        <div className="grid gap-2">
          {resources.map((resource) => (
            <a
              key={resource.href}
              href={resource.href}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center justify-between gap-3 rounded-lg p-3 text-sm font-bold transition ${darkMode ? "bg-white/10 text-slate-100" : "bg-[#E8F8F5] text-[#0B3760]"}`}
            >
              <span>{resource.label}</span>
              <ExternalLink size={15} />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
