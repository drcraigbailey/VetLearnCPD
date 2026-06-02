import { useEffect } from "react";
import { LayoutDashboard, FileText, BriefcaseMedical, Syringe, Menu } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Link, useLocation, useNavigate } from "react-router-dom";

export default function Navbar({ darkMode, onOpenMenu, menuBadgeCount = 0 }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path) => location.pathname === path ? "text-[#71CFC2] opacity-100" : "opacity-50 hover:opacity-100 transition-opacity";

  const labelClass = "text-[10px] font-bold leading-none tracking-normal";

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    const appPlugin = Capacitor?.Plugins?.App || window.Capacitor?.Plugins?.App;
    if (!appPlugin?.addListener) return undefined;

    let listener;

    const attachListener = async () => {
      listener = await appPlugin.addListener("backButton", () => {
        if (location.pathname !== "/") {
          if (window.history.length > 1) navigate(-1);
          else navigate("/", { replace: true });
        }
      });
    };

    attachListener();

    return () => {
      listener?.remove?.();
    };
  }, [location.pathname, navigate]);

  return (
    <div className={`fixed bottom-0 w-full border-t p-4 pb-safe z-30 ${darkMode ? "bg-[#0B242B] border-white/10 text-white" : "bg-white border-[#DCEDEA] text-[#113247]"}`}>
      <div className="max-w-md mx-auto flex justify-between items-center px-2">
        <Link to="/" className={`flex flex-col items-center gap-1 ${isActive("/")}`} aria-label="Dashboard">
          <LayoutDashboard size={24} />
          <span className={labelClass}>Home</span>
        </Link>
        <Link to="/cpd" className={`flex flex-col items-center gap-1 ${isActive("/cpd")}`} aria-label="CPD">
          <FileText size={24} />
          <span className={labelClass}>CPD</span>
        </Link>
        <Link to="/caselogs" className={`flex flex-col items-center gap-1 ${isActive("/caselogs")}`} aria-label="Case Logs">
          <BriefcaseMedical size={24} />
          <span className={labelClass}>Cases</span>
        </Link>
        <Link to="/drugs" className={`flex flex-col items-center gap-1 ${isActive("/drugs")}`} aria-label="Formulary">
          <Syringe size={24} />
          <span className={labelClass}>Formulary</span>
        </Link>
        <button
          onClick={onOpenMenu}
          className="relative flex flex-col items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Open menu"
        >
          <Menu size={24} />
          <span className={labelClass}>More</span>
          {menuBadgeCount > 0 && (
            <span className="absolute -top-2 -right-3 bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 font-bold">
              {menuBadgeCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
