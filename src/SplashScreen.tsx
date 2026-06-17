import { useEffect, useState } from "react";

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const duration = 10000;
    let frame: number;

    function tick(now: number) {
      const elapsed = now - start;
      const p = Math.min(elapsed / duration, 1);
      setProgress(p);
      if (p < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setTimeout(() => setFadeOut(true), 300);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

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
      style={{ backgroundColor: "var(--theme-bg)" }}
    >
      <img
        src="/Icon.svg"
        alt="Tools-33"
        className="w-28 h-28 md:w-36 md:h-36 animate-pulse-soft"
      />

      <div className="w-40 h-1 rounded-full overflow-hidden bg-theme-muted/30">
        <div
          className="h-full rounded-full transition-all duration-75"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: "var(--theme-primary)",
          }}
        />
      </div>
    </div>
  );
}
