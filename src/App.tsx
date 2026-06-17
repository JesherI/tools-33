import { useState, useEffect } from "react";
import "./App.css";
import SplashScreen from "./SplashScreen";
import TitleBar from "./TitleBar";

type Theme = "light" | "dark" | "industrial";

function App() {
  const [loading, setLoading] = useState(true);
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
      <main className="flex-1 flex flex-col items-center justify-center gap-8">
        <h1 className="text-4xl font-bold text-theme-primary">Tools-33</h1>

        <div className="flex gap-3">
          {(["light", "dark", "industrial"] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-4 py-2 rounded-lg border font-medium capitalize transition-colors ${
                theme === t
                  ? "bg-theme-primary text-white border-theme-primary"
                  : "bg-theme-bg text-theme-text border-theme-border hover:border-theme-primary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;
