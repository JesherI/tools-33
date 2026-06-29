interface ExportFormatSelectorProps {
  value: "pdf" | "pptx";
  onChange: (format: "pdf" | "pptx") => void;
}

export function ExportFormatSelector({ value, onChange }: ExportFormatSelectorProps) {
  const btnStyle = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? "var(--theme-primary)" : "color-mix(in srgb, var(--theme-text) 8%, transparent)",
    color: active ? "#fff" : "var(--theme-text)",
  });

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange("pdf")}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
        style={btnStyle(value === "pdf")}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={value === "pdf" ? "#fff" : "#ef4444"} strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        PDF
      </button>
      <button
        onClick={() => onChange("pptx")}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
        style={btnStyle(value === "pptx")}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={value === "pptx" ? "#fff" : "#e95420"} strokeWidth="2">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <polyline points="13 2 13 9 20 9" />
        </svg>
        PPTX
      </button>
    </div>
  );
}
