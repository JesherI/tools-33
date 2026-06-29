import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import SplashScreen from "./SplashScreen";
import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import SystemInfoScreen from "./screens/SystemInfoScreen";
import MagazineScreen from "./screens/MagazineScreen";
import PdfConverterScreen from "./screens/PdfConverterScreen";
import TextureGeneratorScreen from "./screens/TextureGeneratorScreen";
import ImageScalerScreen from "./screens/ImageScalerScreen";
import PdfCompressScreen from "./screens/PdfCompressScreen";
import PdfMergeScreen from "./screens/PdfMergeScreen";
import QrGeneratorScreen from "./screens/QrGeneratorScreen";
import type { SystemInfo } from "./hooks/useSystemInfo";

export type Theme = "light" | "dark" | "industrial";

// Sincronizar tema antes del primer render para evitar flash
const initialTheme = (localStorage.getItem("theme") as Theme) || "light";
document.documentElement.setAttribute("data-theme", initialTheme);

function App() {
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("equipo");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [splashProgress, setSplashProgress] = useState(0);
  const [systemCache, setSystemCache] = useState<SystemInfo | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Cargar datos del sistema durante el splash
  useEffect(() => {
    let cancelled = false;

    async function loadSystemData() {
      try {
        setSplashProgress(0.15);
        await new Promise((r) => setTimeout(r, 150));
        if (cancelled) return;

        setSplashProgress(0.3);
        const info = await invoke<SystemInfo>("get_system_info");
        if (cancelled) return;

        setSystemCache(info);
        setSplashProgress(0.8);
        await new Promise((r) => setTimeout(r, 400));
        if (cancelled) return;

        setSplashProgress(1.0);
      } catch {
        if (!cancelled) {
          setSplashProgress(1.0);
        }
      }
    }

    loadSystemData();

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <SplashScreen
        progress={splashProgress}
        onFinish={() => setLoading(false)}
      />
    );
  }

  const isFullBleed = screen === "texturas" || screen === "escalador";

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-theme-bg text-theme-text transition-colors duration-300">
      {screen !== "texturas" && <TitleBar />}
      <Sidebar theme={theme} setTheme={setTheme} screen={screen} onNavigate={setScreen} />
      <main
        className={
          isFullBleed
            ? "flex-1 flex min-h-0 overflow-hidden p-0 pl-16"
            : "flex-1 min-h-0 overflow-y-auto scrollbar-thin p-6 pl-16"
        }
      >
        {screen === "texturas" ? (
          <TextureGeneratorScreen />
        ) : screen === "escalador" ? (
          <ImageScalerScreen />
        ) : (
          <div className="min-h-full flex items-center justify-center w-full">
            {screen === "equipo" && <SystemInfoScreen cachedInfo={systemCache} />}
            {screen === "revista" && <MagazineScreen />}
            {screen === "pdf" && <PdfConverterScreen />}
            {screen === "compresor" && <PdfCompressScreen />}
            {screen === "unir" && <PdfMergeScreen />}
            {screen === "qr" && <QrGeneratorScreen />}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
