import { useState } from "react";
import type { Theme } from "./App";

const equipoIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const revistaIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <line x1="8" y1="7" x2="16" y2="7" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

interface SidebarProps {
  theme: Theme;
  setTheme: (t: Theme) => void;
  screen: string;
  onNavigate: (s: string) => void;
}

const themes: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "industrial", label: "Industrial" },
];

const navItems = [
  { id: "equipo", icon: equipoIcon, label: "Equipo" },
  { id: "revista", icon: revistaIcon, label: "Revista" },
];

export default function Sidebar({ theme, setTheme, screen, onNavigate }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      className="absolute left-0 top-0 h-full z-40"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className={`h-full transition-all duration-500 ease-in-out overflow-hidden border-r ${
          open ? "w-64" : "w-16"
        }`}
        style={{
          backgroundColor: "color-mix(in srgb, var(--theme-bg) 85%, transparent)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderColor: "var(--theme-border)",
        }}
      >
        {/* Logo */}
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

        <div className="mx-4 h-px" style={{ backgroundColor: "var(--theme-border)" }} />

        {/* Nav items */}
        <div className="p-2 flex flex-col gap-1">
          {navItems.map((item) => {
            const active = screen === item.id;
            return (
              <div
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  active
                    ? "text-theme-primary bg-theme-primary/15"
                    : "text-theme-muted/60 hover:text-theme-primary hover:bg-theme-primary/10"
                } ${open ? "justify-start" : "justify-center"}`}
              >
                <div className={`shrink-0 ${open ? "" : "translate-x-[6px]"}`}>
                  {item.icon}
                </div>
                <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                  open ? "opacity-100 max-w-32 delay-0" : "opacity-0 max-w-0 overflow-hidden"
                }`}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Bottom: gear + version */}
        <div className="absolute bottom-0 left-0 right-0">
          <div className="mx-4 h-px mb-1" style={{ backgroundColor: "var(--theme-border)" }} />

          <div className={`px-2 ${open ? "pb-1" : "pb-0"}`}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSettingsOpen((prev) => !prev);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-theme-muted/60 hover:text-theme-primary hover:bg-theme-primary/15 ${
                open ? "justify-start" : "justify-center"
              }`}
              title="Configuracion"
            >
              <div className={`flex items-center justify-center shrink-0 ${open ? "" : "translate-x-[6px]"}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              </div>
              <span className={`text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                open ? "opacity-100 max-w-32 delay-0" : "opacity-0 max-w-0 overflow-hidden"
              }`}>
                Configuracion
              </span>
            </button>
          </div>

          <div className={`px-4 pb-3 ${open ? "text-left" : "text-center"}`}>
            <span className="text-[10px] font-medium transition-opacity duration-300" style={{ color: "var(--theme-muted)" }}>
              v{__APP_VERSION__}
            </span>
          </div>
        </div>
      </div>

      {/* Settings modal */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "color-mix(in srgb, var(--theme-bg) 70%, transparent)" }}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border shadow-2xl p-8"
            style={{
              backgroundColor: "color-mix(in srgb, var(--theme-bg) 95%, transparent)",
              backdropFilter: "blur(32px)",
              WebkitBackdropFilter: "blur(32px)",
              borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: "var(--theme-primary)" }}>Configuracion</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--theme-muted)" }}>Personaliza la apariencia</p>
                </div>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200 hover:bg-theme-primary/15"
                style={{ color: "var(--theme-muted)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <p className="text-xs font-semibold tracking-wide uppercase mb-3" style={{ color: "var(--theme-muted)" }}>Tema</p>
            <div className="grid grid-cols-3 gap-3">
              {themes.map((t) => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setTheme(t.id); setSettingsOpen(false); }}
                    className={`flex flex-col items-center gap-2 px-3 py-4 rounded-xl border text-sm font-medium transition-all duration-200 ${
                      active ? "text-white" : "hover:bg-theme-primary/10"
                    }`}
                    style={{
                      backgroundColor: active ? "var(--theme-primary)" : "transparent",
                      borderColor: active ? "var(--theme-primary)" : "color-mix(in srgb, var(--theme-border) 50%, transparent)",
                      color: active ? "#ffffff" : "var(--theme-text)",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-full border-2"
                      style={{
                        backgroundColor: t.id === "light" ? "#ffffff" : t.id === "dark" ? "#000000" : "#6D6E71",
                        borderColor: active ? "rgba(255,255,255,0.3)" : "color-mix(in srgb, var(--theme-border) 50%, transparent)",
                      }}
                    />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
