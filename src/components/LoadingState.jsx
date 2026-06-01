import HeartbeatLoader from "./HeartbeatLoader";

export default function LoadingState({ label = "Loading...", darkMode = false, fullScreen = false, className = "" }) {
  const shellClass = fullScreen
    ? `min-h-screen grid place-items-center ${darkMode ? "bg-[#071A24] text-slate-100" : "bg-[#F9FCFB] text-[#113247]"}`
    : "flex flex-col items-center justify-center py-12 gap-4";

  return (
    <div className={`${shellClass} ${className}`}>
      <div className="flex flex-col items-center justify-center gap-4">
        <HeartbeatLoader size={80} />
        <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2] text-center">
          {label}
        </p>
      </div>
    </div>
  );
}
