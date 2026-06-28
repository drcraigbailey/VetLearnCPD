import { useEffect, useState } from "react";

const readOnlineStatus = () => typeof navigator === "undefined" || navigator.onLine !== false;

export default function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(readOnlineStatus);

  useEffect(() => {
    const updateStatus = () => setIsOnline(readOnlineStatus());

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    document.addEventListener("visibilitychange", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
      document.removeEventListener("visibilitychange", updateStatus);
    };
  }, []);

  return isOnline;
}
