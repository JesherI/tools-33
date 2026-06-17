import { getCurrentWindow } from "@tauri-apps/api/window";

export default function TitleBar() {
  const win = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="h-10 flex items-center justify-end pr-3 gap-2 select-none bg-theme-bg"
    >
      <button
        onClick={() => win.minimize()}
        className="group relative w-3.5 h-3.5 rounded-full flex items-center justify-center"
        style={{ backgroundColor: "var(--theme-primary)" }}
        aria-label="Minimize"
      >
        <svg
          className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M2 6h8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <button
        onClick={() => win.toggleMaximize()}
        className="group relative w-3.5 h-3.5 rounded-full flex items-center justify-center"
        style={{ backgroundColor: "var(--theme-primary)" }}
        aria-label="Maximize"
      >
        <svg
          className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          viewBox="0 0 12 12"
          fill="none"
        >
          <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="#fff" strokeWidth="1.5" />
        </svg>
      </button>

      <button
        onClick={() => win.close()}
        className="group relative w-3.5 h-3.5 rounded-full flex items-center justify-center"
        style={{ backgroundColor: "var(--theme-primary)" }}
        aria-label="Close"
      >
        <svg
          className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M3 3l6 6M9 3l-6 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
