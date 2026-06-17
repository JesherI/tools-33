import type { ReactNode } from "react";

type IconVariant = "os" | "pc" | "cpu" | "ram" | "rom" | "gpu-dedicada" | "gpu-integrada";

interface InfoCardProps {
  icon: IconVariant;
  label: string;
  value: string;
  subvalue?: string;
  className?: string;
}

const icons: Record<IconVariant, ReactNode> = {
  os: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  pc: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="16" rx="2" ry="2" />
      <path d="M9 22h6" />
      <path d="M12 18v4" />
    </svg>
  ),
  cpu: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
      <line x1="12" y1="4" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="20" />
      <line x1="4" y1="12" x2="2" y2="12" />
      <line x1="22" y1="12" x2="20" y2="12" />
    </svg>
  ),
  ram: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <line x1="6" y1="10" x2="6" y2="14" />
      <line x1="10" y1="10" x2="10" y2="14" />
      <line x1="14" y1="10" x2="14" y2="14" />
      <line x1="18" y1="10" x2="18" y2="14" />
      <line x1="2" y1="12" x2="22" y2="12" />
    </svg>
  ),
  rom: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  ),
  "gpu-dedicada": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="7" y="8" width="10" height="8" rx="1" />
      <circle cx="10.5" cy="12" r="1.2" />
      <circle cx="13.5" cy="12" r="1.2" />
      <line x1="3" y1="10" x2="5" y2="10" />
      <line x1="3" y1="14" x2="5" y2="14" />
      <line x1="19" y1="10" x2="21" y2="10" />
      <line x1="19" y1="14" x2="21" y2="14" />
    </svg>
  ),
  "gpu-integrada": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
      <line x1="12" y1="4" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="20" />
      <line x1="4" y1="12" x2="2" y2="12" />
      <line x1="22" y1="12" x2="20" y2="12" />
      <path d="M8 5 L5 8" />
      <path d="M16 5 L19 8" />
      <path d="M8 19 L5 16" />
      <path d="M16 19 L19 16" />
    </svg>
  ),
};

export default function InfoCard({ icon, label, value, subvalue, className = "" }: InfoCardProps) {
  return (
    <div
      className={`flex items-start gap-4 p-5 rounded-2xl border transition-colors duration-300 ${className}`}
      style={{
        backgroundColor: "color-mix(in srgb, var(--theme-bg) 50%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
          color: "var(--theme-primary)",
        }}
      >
        {icons[icon]}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-wide uppercase" style={{ color: "var(--theme-muted)" }}>
          {label}
        </p>
        <p className="text-base font-semibold truncate mt-0.5" style={{ color: "var(--theme-text)" }}>
          {value}
        </p>
        {subvalue && (
          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--theme-muted)" }}>
            {subvalue}
          </p>
        )}
      </div>
    </div>
  );
}
