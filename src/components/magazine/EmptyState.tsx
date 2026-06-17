export function EmptyState({
  onSelectFolder,
  hasBackCover,
  onBackCoverChange,
}: {
  onSelectFolder: () => void;
  hasBackCover: boolean;
  onBackCoverChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center text-center py-12 gap-6">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--theme-primary)" }}>Generar Revista</h2>
        <p className="text-sm mt-1" style={{ color: "var(--theme-muted)" }}>
          Selecciona una carpeta con imagenes numeradas (0.jpg, 1.png, ...)
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--theme-muted)" }}>
        <input
          type="checkbox"
          checked={hasBackCover}
          onChange={(e) => onBackCoverChange(e.target.checked)}
          className="accent-orange-500 w-4 h-4"
        />
        Con contraportada
      </label>
      <button
        onClick={onSelectFolder}
        className="px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg"
        style={{ backgroundColor: "var(--theme-primary)" }}
      >
        Seleccionar carpeta
      </button>
    </div>
  );
}
