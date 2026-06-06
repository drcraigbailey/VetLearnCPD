import { ChevronRight, Search } from "lucide-react";

const joinClasses = (...classes) => classes.filter(Boolean).join(" ");

export function PageToolbar({ items = [], activeId, onChange, darkMode = false, className = "" }) {
  const useGrid = items.length > 0 && items.length <= 4;
  const columns = items.length === 4 ? "grid-cols-4" : items.length === 3 ? "grid-cols-3" : items.length === 2 ? "grid-cols-2" : "grid-cols-1";

  return (
    <div
      className={joinClasses(
        useGrid ? `grid ${columns}` : "flex overflow-x-auto scrollbar-hide",
        "gap-2 rounded-lg p-1",
        darkMode ? "bg-white/10" : "bg-[#E8F8F5]",
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange?.(item.id)}
            aria-pressed={active}
            className={joinClasses(
              "min-h-[44px] rounded-md px-3 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2 transition whitespace-nowrap",
              !useGrid && "shrink-0",
              active
                ? "bg-white text-[#123C3A] shadow-sm"
                : darkMode
                  ? "text-slate-200 hover:bg-white/10"
                  : "text-[#123C3A]/75 hover:bg-white/60"
            )}
          >
            {Icon && <Icon size={18} />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FilterPills({ items = [], activeId, onChange, darkMode = false, className = "" }) {
  return (
    <div className={joinClasses("flex flex-wrap gap-2", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange?.(item.id)}
            aria-pressed={active}
            className={joinClasses(
              "rounded-full border px-3 py-2 text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition",
              active
                ? "bg-[#71CFC2] text-[#062F63] border-transparent"
                : darkMode
                  ? "bg-white/10 border-white/10 text-slate-100 hover:bg-white/15"
                  : "bg-white border-[#DCEDEA] text-[#0B3760] hover:bg-[#E8F8F5]"
            )}
          >
            {Icon && <Icon size={15} />}
            <span>{item.label}</span>
            {item.count !== undefined && <span className="opacity-60">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ToolTileGrid({ children, className = "" }) {
  return <div className={joinClasses("grid grid-cols-2 gap-3", className)}>{children}</div>;
}

export function ToolTile({ icon: Icon, title, subtitle, onClick, active = false, darkMode = false, className = "", ...props }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={joinClasses(
        "min-h-[88px] rounded-xl border p-3 flex flex-col items-center justify-center gap-2 text-center font-black transition",
        active
          ? "bg-[#71CFC2] text-[#062F63] border-transparent shadow-sm"
          : darkMode
            ? "bg-white/10 border-white/10 text-slate-100 hover:bg-white/15"
            : "bg-white/90 border-[#DCEDEA] text-[#0B3760] hover:bg-[#E8F8F5]",
        className
      )}
      {...props}
    >
      {Icon && <Icon size={20} />}
      <span className="text-sm leading-tight">{title}</span>
      {subtitle && <span className="text-xs font-bold opacity-60 leading-tight">{subtitle}</span>}
    </button>
  );
}

export function AppButton({ variant = "primary", icon: Icon, children, className = "", darkMode = false, type = "button", ...props }) {
  const styles = {
    primary: "bg-[#71CFC2] text-[#062F63] hover:brightness-95",
    secondary: darkMode ? "bg-white/10 text-slate-100 hover:bg-white/15" : "bg-[#E8F8F5] text-[#0B3760] hover:bg-white",
    ghost: darkMode ? "bg-transparent border border-white/10 text-slate-100 hover:bg-white/10" : "bg-transparent border border-[#DCEDEA] text-[#0B3760] hover:bg-[#E8F8F5]",
    danger: "bg-red-500 text-white hover:bg-red-600"
  };

  return (
    <button
      type={type}
      className={joinClasses(
        "min-h-[44px] rounded-lg px-4 py-2.5 inline-flex items-center justify-center gap-2 text-sm font-black transition disabled:opacity-60 disabled:cursor-not-allowed",
        styles[variant] || styles.primary,
        className
      )}
      {...props}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, badge, darkMode = false, variant = "default", className = "", type = "button", ...props }) {
  const isDanger = variant === "danger";
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={joinClasses(
        "h-10 w-10 rounded-full grid place-items-center relative transition disabled:opacity-60 disabled:cursor-not-allowed",
        isDanger
          ? darkMode
            ? "bg-transparent text-red-400 hover:bg-red-500/10"
            : "bg-transparent text-red-600 hover:bg-red-50"
          : darkMode
            ? "bg-white/10 text-slate-100 hover:bg-white/15"
            : "bg-[#E8F8F5] text-[#0B3760] hover:bg-white",
        className
      )}
      {...props}
    >
      {Icon && <Icon size={18} />}
      {badge ? (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold px-1">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search...", darkMode = false, icon: Icon = Search, className = "", ...props }) {
  return (
    <label
      className={joinClasses(
        "flex items-center gap-2 rounded-xl border px-3 py-3",
        darkMode ? "bg-white/10 border-white/10 text-slate-100" : "bg-white/90 border-[#DCEDEA] text-[#0B3760]",
        className
      )}
    >
      {Icon && <Icon size={18} className="opacity-55 shrink-0" />}
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-transparent outline-none text-sm font-semibold placeholder:opacity-60"
        {...props}
      />
    </label>
  );
}

export function JumpButton({ icon: Icon, title, subtitle, onClick, darkMode = false, className = "", ...props }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={joinClasses(
        "w-full rounded-lg border px-4 py-3 text-left transition flex items-center justify-between gap-3",
        darkMode
          ? "bg-white/10 border-white/10 text-slate-100 hover:bg-white/15"
          : "bg-white/90 border-[#DCEDEA] text-[#0B3760] hover:bg-[#E8F8F5]",
        className
      )}
      {...props}
    >
      <span className="flex items-center gap-2 text-sm font-black">
        {Icon && <Icon size={18} />}
        {title}
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-bold opacity-60">
        {subtitle}
        <ChevronRight size={14} />
      </span>
    </button>
  );
}
