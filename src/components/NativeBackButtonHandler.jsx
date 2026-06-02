import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export default function NativeBackButtonHandler({ menuOpen, notificationsOpen, onCloseMenu, onCloseNotifications }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let listener;

    const attachListener = async () => {
      listener = await CapacitorApp.addListener("backButton", () => {
        if (notificationsOpen) {
          onCloseNotifications();
          return;
        }

        if (menuOpen) {
          onCloseMenu();
          return;
        }

        if (location.pathname !== "/") {
          if (window.history.length > 1) navigate(-1);
          else navigate("/", { replace: true });
          return;
        }
      });
    };

    attachListener();

    return () => {
      listener?.remove?.();
    };
  }, [location.pathname, menuOpen, navigate, notificationsOpen, onCloseMenu, onCloseNotifications]);

  return null;
}
