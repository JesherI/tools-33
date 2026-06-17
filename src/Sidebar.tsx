import { useState } from "react";

const navItems = [
  {
    label: "Proyectos",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: "Planos",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    ),
  },
  {
    label: "Obras",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="absolute left-0 top-0 h-full z-40"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className={`h-full transition-all duration-500 ease-in-out overflow-hidden border-r border-theme-border ${
          open ? "w-64" : "w-16"
        }`}
        style={{
          backgroundColor: "color-mix(in srgb, var(--theme-bg) 85%, transparent)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className={`flex items-center gap-3 ${open ? "p-4 justify-start" : "h-16 justify-center"}`}>
          <div className={`w-8 h-8 flex items-center justify-center shrink-0 ${open ? "" : "translate-x-[6px]"}`}>
            <img src="/Icon.svg" alt="Tools-33" className="w-7 h-auto" />
          </div>
          <span className={`text-sm font-semibold tracking-wider text-theme-primary whitespace-nowrap transition-all duration-300 ${
            open ? "opacity-100 max-w-40 delay-0" : "opacity-0 max-w-0 overflow-hidden"
          }`}>
            TOOLS 33
          </span>
        </div>

        <div className="mx-4 h-px bg-theme-border" />

        <div className="p-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-theme-text/60 hover:text-theme-primary hover:bg-theme-primary/15 ${
                open ? "justify-start" : "justify-center"
              }`}
            >
              {item.icon}
              <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                open ? "opacity-100 max-w-32 delay-0" : "opacity-0 max-w-0 overflow-hidden"
              }`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>

        <div className="absolute bottom-4 left-0 right-0 px-4">
          <div className={`flex items-center gap-2 text-[10px] text-theme-muted/60 transition-all duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}>
            <span className="font-medium">v0.1.1</span>
          </div>
        </div>
      </div>
    </div>
  );
}
