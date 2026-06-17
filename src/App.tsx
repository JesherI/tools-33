import { useState, useEffect } from "react";
import "./App.css";
import SplashScreen from "./SplashScreen";
import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import SystemInfoScreen from "./screens/SystemInfoScreen";
import MagazineScreen from "./screens/MagazineScreen";

export type Theme = "light" | "dark" | "industrial";

function App() {
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("equipo");
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("theme") as Theme) || "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  if (loading) {
    return <SplashScreen onFinish={() => setLoading(false)} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-theme-bg text-theme-text transition-colors duration-300">
      <TitleBar />
      <Sidebar theme={theme} setTheme={setTheme} screen={screen} onNavigate={setScreen} />
      <main className="flex-1 flex items-center justify-center p-6 pl-16">
        {screen === "equipo" && <SystemInfoScreen />}
        {screen === "revista" && <MagazineScreen />}
      </main>
    </div>
  );
}

export default App;
