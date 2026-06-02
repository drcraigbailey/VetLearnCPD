import { useEffect, useState } from "react";
import { Check, GripHorizontal, Pause, Play, X } from "lucide-react";

const persistSession = (session) => {
  localStorage.setItem("vetlearn-active-reading", JSON.stringify(session));
};

const formatElapsed = (session, pausedAt = null) => {
  if (!session?.started_at) return "0:00";

  const endTime = pausedAt ? new Date(pausedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((endTime - new Date(session.started_at).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

export default function FloatingReadingTimer({ session, onFinish, onCancel, darkMode = false }) {
  const [pausedAt, setPausedAt] = useState(session?.paused_at || null);
  const [elapsed, setElapsed] = useState(() => formatElapsed(session, session?.paused_at));
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem("vetlearn-timer-position");
    return saved ? JSON.parse(saved) : { x: 18, y: 110 };
  });
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setPausedAt(session?.paused_at || null);
  }, [session]);

  useEffect(() => {
    if (!session) return;

    setElapsed(formatElapsed(session, pausedAt));
    if (pausedAt) return;

    const interval = setInterval(() => {
      setElapsed(formatElapsed(session));
    }, 1000);

    return () => clearInterval(interval);
  }, [session, pausedAt]);

  useEffect(() => {
    localStorage.setItem("vetlearn-timer-position", JSON.stringify(position));
  }, [position]);

  if (!session) return null;

  const startDrag = (event) => {
    const pointer = event.touches?.[0] || event;
    setDragging(true);
    setDragOffset({
      x: pointer.clientX - position.x,
      y: pointer.clientY - position.y
    });
  };

  const moveDrag = (event) => {
    if (!dragging) return;

    const pointer = event.touches?.[0] || event;
    const nextX = Math.min(Math.max(8, pointer.clientX - dragOffset.x), window.innerWidth - 250);
    const nextY = Math.min(Math.max(8, pointer.clientY - dragOffset.y), window.innerHeight - 132);

    setPosition({ x: nextX, y: nextY });
  };

  const stopDrag = () => setDragging(false);

  const resumePausedSession = () => {
    if (!pausedAt) return;

    const pausedMilliseconds = Math.max(0, Date.now() - new Date(pausedAt).getTime());
    session.started_at = new Date(new Date(session.started_at).getTime() + pausedMilliseconds).toISOString();
    delete session.paused_at;
    persistSession(session);
    setPausedAt(null);
    setElapsed(formatElapsed(session));
  };

  const togglePause = () => {
    if (pausedAt) {
      resumePausedSession();
      return;
    }

    const nextPausedAt = new Date().toISOString();
    session.paused_at = nextPausedAt;
    persistSession(session);
    setPausedAt(nextPausedAt);
    setElapsed(formatElapsed(session, nextPausedAt));
  };

  const finishReading = () => {
    resumePausedSession();
    onFinish();
  };

  return (
    <div
      className={`fixed z-[80] w-[238px] rounded-2xl border p-3 shadow-2xl backdrop-blur-xl ${darkMode ? "bg-[#071A24]/95 border-white/10 text-white" : "bg-white/95 border-[#DCEDEA] text-[#113247]"}`}
      style={{ left: position.x, top: position.y, touchAction: "none" }}
      onMouseMove={moveDrag}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onTouchMove={moveDrag}
      onTouchEnd={stopDrag}
    >
      <button
        className={`mb-2 flex w-full cursor-move items-center justify-center rounded-xl py-1 ${darkMode ? "bg-white/10 text-slate-300" : "bg-[#F0F6F5] text-slate-500"}`}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        aria-label="Move timer"
      >
        <GripHorizontal size={18} />
      </button>

      <div className="text-xs font-bold text-[#0F8F83]">
        {pausedAt ? "Paused" : "Reading now"}
      </div>

      <div className="mt-1 truncate text-sm font-black">
        {session.title || "Untitled reading"}
      </div>

      <div className="mt-2 text-3xl font-black text-[#71CFC2]">
        {elapsed}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
        <button
          className="flex items-center justify-center gap-2 rounded-xl bg-[#71CFC2] px-3 py-3 text-sm font-black text-[#062F63]"
          onClick={finishReading}
        >
          <Check size={16} />
          Finish
        </button>

        <button
          className={`rounded-xl px-3 py-3 ${pausedAt ? "bg-[#E8F8F5] text-[#0B3760]" : darkMode ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"}`}
          onClick={togglePause}
          aria-label={pausedAt ? "Resume reading timer" : "Pause reading timer"}
        >
          {pausedAt ? <Play size={16} /> : <Pause size={16} />}
        </button>

        <button
          className={`rounded-xl px-3 py-3 ${darkMode ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"}`}
          onClick={onCancel}
          aria-label="Cancel reading session"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
