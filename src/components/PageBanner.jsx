export default function PageBanner({
  title,
  subtitle,
  darkMode = false,
  badges = [],
  children
}) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br border rounded-lg p-6 mb-6 shadow-[0_18px_45px_rgba(11,55,96,0.08)] ${
        darkMode
          ? "from-[#12323A] to-[#0B242B] border-white/10 text-white"
          : "from-white to-[#DFF7F3] border-[#CDEBE7] text-[#113247]"
      }`}
    >
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        className="absolute -right-8 -bottom-12 w-44 h-44 object-contain opacity-[0.10] pointer-events-none"
      />

      <div className="relative">
        {badges.length > 0 && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {badges.map((badge) => (
              <span
                key={badge.label}
                className={`${
                  badge.accent
                    ? darkMode
                      ? "bg-white/10 text-[#71CFC2] border-white/10"
                      : "bg-white text-[#0F8F83] border-[#DCEDEA]"
                    : darkMode
                      ? "bg-white/10 text-slate-100 border-white/10"
                      : "bg-white text-[#0B3760] border-[#DCEDEA]"
                } border rounded-full px-3 py-2 text-xs font-bold flex items-center gap-1`}
              >
                {badge.icon}
                {badge.label}
              </span>
            ))}
          </div>
        )}

        <h1 className={`text-3xl font-black leading-tight tracking-normal mb-2 ${darkMode ? "text-white" : "text-[#113247]"}`}>
          {title}
        </h1>

        {subtitle && (
          <p className={`text-sm leading-6 max-w-[300px] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
            {subtitle}
          </p>
        )}

        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  );
}
