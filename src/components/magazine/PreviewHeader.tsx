export function PreviewHeader({
  total,
  spreadsCount,
  hasBackCover,
  onBack,
}: {
  total: number;
  spreadsCount: number;
  hasBackCover: boolean;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-xl transition-all duration-200"
          style={{ color: "var(--theme-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--theme-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--theme-muted)")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h3 className="text-lg font-semibold" style={{ color: "var(--theme-primary)" }}>Orden de impresion</h3>
          <span className="text-xs" style={{ color: "var(--theme-muted)" }}>
            {total} paginas = {spreadsCount} pliegos
            {hasBackCover ? " (con portada/contraportada)" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
