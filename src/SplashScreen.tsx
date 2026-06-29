import { useEffect, useState } from "react";

interface SplashScreenProps {
  progress: number; // 0-1 real loading progress
  onFinish: () => void;
}

export default function SplashScreen({ progress, onFinish }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (progress >= 1 && !fadeOut) {
      setFadeOut(true);
    }
  }, [progress, fadeOut]);

  useEffect(() => {
    if (!fadeOut) return;
    const timer = setTimeout(onFinish, 500);
    return () => clearTimeout(timer);
  }, [fadeOut, onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
      style={{
        backgroundColor: "var(--theme-bg)",
      }}
    >
      <img
        src="/Icon.svg"
        alt="Tools-33"
        className="w-28 h-28 md:w-36 md:h-36 animate-pulse-soft"
      />

      <div className="w-40 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--theme-text) 20%, transparent)" }}>
        <div
          className="h-full rounded-full transition-all duration-150 ease-out"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: "var(--theme-primary)",
          }}
        />
      </div>
    </div>
  );
}
