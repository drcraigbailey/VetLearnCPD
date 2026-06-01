import { LayoutDashboard, FileText, BriefcaseMedical, Syringe, Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export default function Navbar({ darkMode, onOpenMenu, menuBadgeCount = 0 }) {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ? "text-[#71CFC2] opacity-100" : "opacity-50 hover:opacity-100 transition-opacity";

  return (
    <div className={`fixed bottom-0 w-full border-t p-4 pb-safe z-30 ${darkMode ? "bg-[#0B242B] border-white/10 text-white" : "bg-white border-[#DCEDEA] text-[#113247]"}`}>
      <div className="max-w-md mx-auto flex justify-between items-center px-4">
        <Link to="/" className={`flex flex-col items-center gap-1 ${isActive("/")}`}>
          <LayoutDashboard size={24} />
        </Link>
        <Link to="/cpd" className={`flex flex-col items-center gap-1 ${isActive("/cpd")}`}>
          <FileText size={24} />
        </Link>
        <Link to="/caselogs" className={`flex flex-col items-center gap-1 ${isActive("/caselogs")}`}>
          <BriefcaseMedical size={24} />
        </Link>
        <Link to="/drugs" className={`flex flex-col items-center gap-1 ${isActive("/drugs")}`}>
          <Syringe size={24} />
        </Link>
        <button
          onClick={onOpenMenu}
          className="relative flex flex-col items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Open menu"
        >
          <Menu size={24} />
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
