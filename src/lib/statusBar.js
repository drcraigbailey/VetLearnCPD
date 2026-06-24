import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

const STATUS_BAR_COLOURS = {
  dark: "#071A24",
  light: "#F9FCFB"
};

const runStatusBarTask = async (task) => {
  try {
    await task();
  } catch (error) {
    console.warn("Status bar update skipped:", error);
  }
};

export const configureStatusBar = (darkMode = false) => {
  if (!Capacitor.isNativePlatform?.()) return;

  const backgroundColor = darkMode ? STATUS_BAR_COLOURS.dark : STATUS_BAR_COLOURS.light;
  const style = darkMode ? Style.Dark : Style.Light;

  document.documentElement.style.setProperty("--vetlearn-status-bar-bg", backgroundColor);
  document.documentElement.classList.add("vetlearn-native");

  runStatusBarTask(() => StatusBar.show());
  runStatusBarTask(() => StatusBar.setOverlaysWebView({ overlay: false }));
  runStatusBarTask(() => StatusBar.setStyle({ style }));
  runStatusBarTask(() => StatusBar.setBackgroundColor({ color: backgroundColor }));
};
